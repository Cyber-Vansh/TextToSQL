import os
import time
import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_community.utilities import SQLDatabase
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains import create_sql_query_chain
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool
import datetime
from decimal import Decimal

app = FastAPI()

api_key = os.getenv("GOOGLE_API_KEY")
llm = ChatGoogleGenerativeAI(model="gemini-flash-latest", temperature=0, google_api_key=api_key)

class DBConnection(BaseModel):
    type: str
    config: dict

class QueryRequest(BaseModel):
    question: str
    db_connection: DBConnection
    history: list[str] = []

@app.get("/")
def home():
    print(f"[{datetime.datetime.now()}] Health check received")
    return {"status": "ok"}

def serialize_value(value):
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value

@app.post("/query")
async def process_query(request: QueryRequest):
    try:
        db = None
        engine = None

        if request.db_connection.type == 'mysql':
            from urllib.parse import quote_plus

            config = request.db_connection.config
            host = config.get('host', 'localhost')
            port = int(config.get('port', 3306))
            user = config.get('user', '')
            password = config.get('password', '')
            database = config.get('database', '')
            
            if ':' in host:
                host = host.split(':')[0]
            
            if host in ['localhost', '127.0.0.1']:
                 host = 'host.docker.internal'

            encoded_password = quote_plus(password)
            
            db_uri = f"mysql+pymysql://{user}:{encoded_password}@{host}:{port}/{database}"
            
            engine = create_engine(db_uri)
            db = SQLDatabase(engine)
        
        elif request.db_connection.type == 'csv':
            if 'csvContent' in request.db_connection.config:
                import io
                csv_content = request.db_connection.config['csvContent']
                df = pd.read_csv(io.StringIO(csv_content))
            else:
                csv_path = request.db_connection.config.get('csvPath') 
                filename = os.path.basename(csv_path)
                full_path = f"/app/uploads/{filename}"
                df = pd.read_csv(full_path)
            
            engine = create_engine(
                "sqlite://", 
                poolclass=StaticPool,
                connect_args={"check_same_thread": False}
            )
            
            df.to_sql("data", engine, index=False, if_exists='replace')
            
            db = SQLDatabase(engine)

        else:
             raise HTTPException(status_code=400, detail="Invalid database type")

        from langchain_core.prompts import PromptTemplate

        db_name = request.db_connection.config.get('database', 'data') if request.db_connection.type == 'mysql' else 'data'
        db_type = request.db_connection.type

        if db_type == 'mysql':
            system_prompt = f"""You are a MySQL expert. Given an input question, create a syntactically correct MySQL query to run.
            Unless the user specifies otherwise, obtain the relevant data from the database.
            
            Important:
            - If the user asks for "all table names", you MUST query the `information_schema.tables` table.
            - Example: SELECT table_name FROM information_schema.tables WHERE table_schema = '{db_name}';
            - Never query for all columns from a specific table, only ask for a few relevant columns given the question.
            - Pay attention to use only the column names you can see in the tables below. Be careful to not query for columns that do not exist.
            - Also, pay attention to which column is in which table.
            - CRITICAL: Generate a SINGLE SQL query. Do NOT generate multiple queries separated by semicolons.
            """
        else:
            system_prompt = f"""You are a SQLite expert. Given an input question, create a syntactically correct SQLite query to run.
            Unless the user specifies otherwise, obtain the relevant data from the database.
            
            Important:
            - If the user asks for "all table names", you MUST query the `sqlite_master` table.
            - Example: SELECT name FROM sqlite_master WHERE type='table';
            - Never query for all columns from a specific table, only ask for a few relevant columns given the question.
            - Pay attention to use only the column names you can see in the tables below. Be careful to not query for columns that do not exist.
            - Also, pay attention to which column is in which table.
            - CRITICAL: Generate a SINGLE SQL query. Do NOT generate multiple queries separated by semicolons.
            """
        
        chat_history_str = "\n".join(request.history) if request.history else "No previous history."
        
        full_prompt_template = system_prompt + f"""
        
        Previous Conversation History:
        {chat_history_str}
        
        Only use the following tables:
        {{table_info}}
        
        Question: {{input}}
        
        Limit: {{top_k}}
        """
        
        prompt = PromptTemplate.from_template(full_prompt_template)
        chain = create_sql_query_chain(llm, db, k=100, prompt=prompt)
        
        max_retries = 3
        last_error = None
        current_question = request.question
        
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    print(f"Self-correction attempt {attempt}: Retrying with error context...")
                    current_question = f"{request.question}\n\nThe previous query failed with error: {last_error}\nPlease fix the SQL."

                response = chain.invoke({"question": current_question})
                cleaned_sql = response
                
                code_block_pattern = r"```(?:sqlite|mysql|sql)?\s*(.*?)```"
                match = re.search(code_block_pattern, cleaned_sql, re.DOTALL | re.IGNORECASE)
                if match:
                    cleaned_sql = match.group(1)

                if "SQLQuery:" in cleaned_sql:
                    cleaned_sql = cleaned_sql.split("SQLQuery:")[1]
                    
                cleaned_sql = cleaned_sql.strip()
                
                result_data = []
                with engine.connect() as connection:
                    result_proxy = connection.execute(text(cleaned_sql))
                    if result_proxy.returns_rows:
                        keys = result_proxy.keys()
                        result_data = [
                            {key: serialize_value(value) for key, value in zip(keys, row)}
                            for row in result_proxy.fetchall()
                        ]
                
                return {
                    "question": request.question,
                    "sql": cleaned_sql,
                    "data": result_data
                }

            except Exception as e:
                print(f"Error executing SQL (Attempt {attempt+1}/{max_retries}): {e}")
                last_error = str(e)
        
        raise HTTPException(status_code=500, detail=f"Failed to generate valid SQL after {max_retries} attempts. Last error: {last_error}")

    except Exception as e:
        print(f"Error processing query: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class SchemaRequest(BaseModel):
    db_connection: DBConnection

@app.post("/schema")
async def get_schema(request: SchemaRequest):
    try:
        engine = None
        
        if request.db_connection.type == 'mysql':
            from urllib.parse import quote_plus
            config = request.db_connection.config
            host = config.get('host', 'localhost')
            port = int(config.get('port', 3306))
            user = config.get('user', '')
            password = config.get('password', '')
            database = config.get('database', '')
            
            if ':' in host:
                host = host.split(':')[0]
            if host in ['localhost', '127.0.0.1']:
                 host = 'host.docker.internal'

            encoded_password = quote_plus(password)
            db_uri = f"mysql+pymysql://{user}:{encoded_password}@{host}:{port}/{database}"
            engine = create_engine(db_uri)

        elif request.db_connection.type == 'csv':
            import io
            
            engine = create_engine(
                "sqlite://", 
                poolclass=StaticPool,
                connect_args={"check_same_thread": False}
            )

            if 'csvContent' in request.db_connection.config:
                csv_content = request.db_connection.config['csvContent']
                df = pd.read_csv(io.StringIO(csv_content))
            else:
                csv_path = request.db_connection.config.get('csvPath')
                filename = os.path.basename(csv_path)
                full_path = f"/app/uploads/{filename}"
                df = pd.read_csv(full_path)

            df.to_sql("data", engine, index=False, if_exists='replace')
        
        else:
            raise HTTPException(status_code=400, detail="Invalid database type")

        from sqlalchemy import inspect
        inspector = inspect(engine)
        table_names = inspector.get_table_names()
        
        tables = []
        relationships = []
        
        for table_name in table_names:
            columns = []
            for col in inspector.get_columns(table_name):
                columns.append({
                    "name": col['name'],
                    "type": str(col['type'])
                })
            tables.append({
                "name": table_name,
                "columns": columns
            })
            
            try:
                fks = inspector.get_foreign_keys(table_name)
                for fk in fks:
                    relationships.append({
                        "from": table_name,
                        "to": fk['referred_table'],
                        "cols": fk['constrained_columns'],
                        "refCols": fk['referred_columns']
                    })
            except Exception as e:
                print(f"Error fetching foreign keys for {table_name}: {e}")
            
        return {"tables": tables, "relationships": relationships}

    except Exception as e:
        print(f"Error fetching schema: {e}")
        raise HTTPException(status_code=500, detail=str(e))
