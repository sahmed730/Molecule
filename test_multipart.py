from fastapi import FastAPI, File, UploadFile
app = FastAPI()
@app.post('/upload')
def upload(file: UploadFile = File(...)):
    pass
