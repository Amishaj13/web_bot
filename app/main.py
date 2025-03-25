from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain.schema import Document
from requests.exceptions import RequestException

# Load environment variables
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
CHROMA_PATH = "chroma_db"

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Load LLM and embeddings
google_embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
llm = ChatGoogleGenerativeAI(model="gemini-1.5-pro", temperature=1.0)

# Connect to ChromaDB
vector_store = Chroma(
    collection_name="company_knowledge",
    embedding_function=google_embeddings,
    persist_directory=CHROMA_PATH,
)
retriever = vector_store.as_retriever(search_kwargs={'k': 5})

# Initialize conversation memory
conversation_memory = []

# Function to scrape website content
def fetch_website_content(url):
    try:
        print(f"Fetching content from URL: {url}")
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        content = soup.get_text()
        print(f"Fetched content length: {len(content)}")
        return content
    except RequestException as e:
        print(f"Error fetching website content: {e}")
        return None

# Endpoint to scrape and store website content
@app.route('/scrape', methods=['POST'])
def scrape():
    data = request.json
    url = data.get("url")

    if not url:
        return jsonify({"success": False, "error": "No URL provided."}), 400

    try:
        # Fetch and scrape the website content
        content = fetch_website_content(url)
        if not content:
            return jsonify({"success": False, "error": "Failed to fetch website content."}), 500

        # Store the new content in ChromaDB
        print("Storing new content in ChromaDB...")
        doc = Document(page_content=content, metadata={"source": url})
        vector_store.add_documents([doc])
        print("Content stored successfully.")

        # Update the retriever
        global retriever
        retriever = vector_store.as_retriever(search_kwargs={'k': 5})
        print("Retriever updated successfully.")

        # Clear conversation memory for the new website
        global conversation_memory
        conversation_memory = []
        print("Conversation memory cleared.")

        return jsonify({"success": True})
    except Exception as e:
        print(f"Error in /scrape endpoint: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

# Endpoint to handle chat queries
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_input = data.get("message")

    if not user_input:
        return jsonify({"response": "Please provide a valid question."})

    # Add user input to conversation memory
    conversation_memory.append({"role": "user", "content": user_input})

    # Retrieve relevant documents from ChromaDB
    docs = retriever.get_relevant_documents(user_input)
    print(f"Retrieved {len(docs)} documents from ChromaDB.")
    for doc in docs:
        print(f"Document Source: {doc.metadata['source']}")
        print(f"Document Content: {doc.page_content[:200]}")  # Print the first 200 characters

    knowledge = "\n\n".join([doc.page_content for doc in docs])

    # Generate a response using the LLM
    prompt = f"""
    You are an AI assistant that answers queries based on the most recent website's data.
    Use the stored knowledge and previous conversation history to provide a relevant response.

    Stored Knowledge:
    {knowledge}

    Previous Conversation:
    {conversation_memory[-5:]}

    User Message:
    {user_input}
    """
    response = "".join(chunk.content for chunk in llm.stream(prompt) if chunk.content)
    conversation_memory.append({"role": "assistant", "content": response})

    return jsonify({"response": response or "No AI response generated."})

if __name__ == '__main__':
    app.run(debug=True)
