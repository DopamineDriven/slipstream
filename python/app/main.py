from dotenv import load_dotenv
from fastapi import FastAPI
from app.api import router

load_dotenv()

app = FastAPI()
app.include_router(router)  # register endpoints


# Optionally: root health check
@app.get("/")
def health():
    return {"status": "ok"}
