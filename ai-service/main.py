import os
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_community.utilities import SQLDatabase
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import create_sql_query_chain

app = FastAPI()

db_user = os.getenv("DATABASE_USER", "user")
db_password = os.getenv("DATABASE_PASSWORD", "password")
db_host = os.getenv("DATABASE_HOST", "mysql")
db_name = os.getenv("DATABASE_NAME", "ecommerce")

db_uri = f"mysql+pymysql://{db_user}:{db_password}@{db_host}/{db_name}"

db = None

@app.on_event("startup")
def startup_db_client():
    global db
    retries = 10
    while retries > 0:
        try:
            db = SQLDatabase.from_uri(db_uri)
            db.run("SELECT 1")
            print("Database connected!")
            return
        except Exception as e:
            print(f"Database not ready yet... retrying ({e})")
            retries -= 1
            time.sleep(3)

api_key = os.getenv("GOOGLE_API_KEY")
llm = ChatGoogleGenerativeAI(model="gemini-flash-latest", temperature=0, google_api_key=api_key)

class QueryRequest(BaseModel):
    question: str

@app.get("/")
def home():
    return {"status": "ok"}

@app.post("/query")
async def process_query(request: QueryRequest):
    if not db:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    try:
        chain = create_sql_query_chain(llm, db)
        response = chain.invoke({"question": request.question})
        
        cleaned_sql = response
        if "SQLQuery:" in response:
            cleaned_sql = response.split("SQLQuery:")[1]
        
        cleaned_sql = cleaned_sql.strip().replace("```sql", "").replace("```", "").strip()
        
        result = db.run(cleaned_sql)
        
        return {
            "question": request.question,
            "sql": cleaned_sql,
            "data": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
