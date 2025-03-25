import os
import json
import logging
import requests
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from bs4 import BeautifulSoup
from langchain_chroma import Chroma
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain.schema import Document
from requests.exceptions import ConnectTimeout, HTTPError
from urllib.parse import urlparse
import threading
import shutil
import time



# Load environment variables
load_dotenv()

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CHROMA_BASE_PATH = "chroma_db"

google_embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
llm = ChatGoogleGenerativeAI(model="gemini-1.5-pro", temperature=1.0)

# -------- Tenant-scoped state --------
tenant_data = {}  # Example structure: { "tenant_id": {"vector_store": ..., "data_file": ..., "website": ...}}

# -------- Models --------
class ScrapeRequest(BaseModel):
    tenant_id: str
    website_url: str

class ChatRequest(BaseModel):
    tenant_id: str
    message: str
    conversation_id: Optional[str] = None

class Message(BaseModel):
    role: str
    content: str
    timestamp: Optional[str] = None

class Conversation(BaseModel):
    messages: list[Message] = []

conversation_memory = {}  # { tenant_id: { conversation_id: Conversation } }

# -------- Utility Functions --------
def sanitize_url(url: str) -> str:
    parsed_url = urlparse(url)
    return parsed_url.netloc.replace('.', '_')

def fetch_website_content(url: str) -> str:
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
    except ConnectTimeout:
        logger.error(f"Connection to {url} timed out.")
        return None
    except HTTPError as http_err:
        logger.error(f"HTTP error occurred: {http_err}")
        return None
    except Exception as err:
        logger.error(f"An error occurred: {err}")
        return None
    soup = BeautifulSoup(response.text, "html.parser")
    return soup.get_text()

def initialize_tenant(tenant_id: str, url: str):
    domain_key = sanitize_url(url)
    chroma_path = f"{CHROMA_BASE_PATH}/{tenant_id}/{domain_key}"

    # Reset or create Chroma collection
    vector_store = Chroma(
        collection_name=f"{tenant_id}_{domain_key}",
        embedding_function=google_embeddings,
        persist_directory=chroma_path,
    )
    tenant_data[tenant_id] = {
        "vector_store": vector_store,
        "website": url,
        "chroma_path": chroma_path,
    }

# -------- Endpoints --------

@app.post("/scrape")


async def scrape_and_store(req: ScrapeRequest):
    tenant_id = req.tenant_id
    url = req.website_url

    # Auto-clean tenant if switching websites
    if tenant_id in tenant_data and tenant_data[tenant_id]["website_url"] != url:
        logger.info(f"Resetting ChromaDB for tenant {tenant_id} due to URL switch.")
        del tenant_data[tenant_id]

    # Create tenant-specific DB dir
    db_dir = f"./chroma_db_{tenant_id}"
    
    os.makedirs(db_dir, exist_ok=True)  # Ensure the directory exists

    # Create new Chroma vector store
    vector_store = Chroma(
        collection_name=f"{tenant_id}_collection",
        persist_directory=db_dir,
        embedding_function=google_embeddings
    )
    vector_store.reset_collection()  # Auto-clean collection during creation

    # Store tenant info
    tenant_data[tenant_id] = {
        "website_url": url,
        "vector_store": vector_store,
        "conversations": {},
        "last_access": time.time()  # store as epoch timestamp

    }

    # Scrape website
    website_text = fetch_website_content(url)
    if not website_text:
        return {"status": "error", "message": "Failed to scrape website."}

    # Add scraped doc
    doc = Document(page_content=website_text, metadata={"source": url})
    tenant_data[tenant_id]["vector_store"].add_documents([doc])
    print(f"Stored website data for {url} in ChromaDB.")
    return {"status": "success", "message": f"Website data for {url} loaded into ChromaDB."}

    



@app.post("/chat")
async def chat_with_bot(data: ChatRequest):

    tenant_id = data.tenant_id
    
    tenant_data[tenant_id]["last_access"] = time.time()

    
    if tenant_id not in tenant_data:
        return {"status": "error", "message": "Tenant session not initialized. Scrape website first."}

    if tenant_id not in conversation_memory:
        conversation_memory[tenant_id] = {}

    if data.conversation_id not in conversation_memory[tenant_id]:
        conversation_memory[tenant_id][data.conversation_id] = Conversation(messages=[])

    conversation = conversation_memory[tenant_id][data.conversation_id]
    conversation.messages.append(Message(role="user", content=data.message))

    retriever = tenant_data[tenant_id]["vector_store"].as_retriever(search_kwargs={'k': 5})
    docs = retriever.get_relevant_documents(data.message)
    knowledge = "\n\n".join([doc.page_content for doc in docs])

    prompt_template = """
    You are an AI assistant that answers queries based on scraped website data.
    Use the website knowledge and conversation context to provide helpful answers.
    

    Website Knowledge:
    {knowledge}

    Previous Conversation:
    {previous_conversation}

    User Message:
    {user_message}
    """
    previous_conversation = '\n'.join([f'{msg.role}: {msg.content}' for msg in conversation.messages[-5:]])
    prompt = prompt_template.format(
        knowledge=knowledge,
        previous_conversation=previous_conversation,
        user_message=data.message
    )

    response = ""
    for chunk in llm.stream(prompt):
        if chunk.content:
            response += chunk.content

    conversation.messages.append(Message(role="assistant", content=response))
    return {"status": "success", "response": response or "No AI response generated."}



# code to delete tenant chromaDB from local storage
TTL_SECONDS = 24 * 60 * 60  # 24 hours

def cleanup_inactive_tenants():
    while True:
        current_time = time.time()
        tenants_to_delete = []

        for tenant_id, data in list(tenant_data.items()):
            last_access = data.get("last_access", current_time)
            if current_time - last_access > TTL_SECONDS:
                tenants_to_delete.append(tenant_id)

        for tenant_id in tenants_to_delete:
            logger.info(f"Auto-cleaning tenant {tenant_id} due to inactivity.")
            db_dir = tenant_data[tenant_id]["vector_store"]._persist_directory

            try:
                # Clean the chroma directory
                if os.path.exists(db_dir):
                    shutil.rmtree(db_dir)
                    logger.info(f"Deleted directory: {db_dir}")
            except Exception as e:
                logger.error(f"Error deleting directory {db_dir}: {e}")

            # Clean from memory
            del tenant_data[tenant_id]

        time.sleep(3600)  # Check every 1 hour

# Start the background cleaner when app launches
def start_cleanup_thread():
    thread = threading.Thread(target=cleanup_inactive_tenants, daemon=True)
    thread.start()

start_cleanup_thread()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5000)
