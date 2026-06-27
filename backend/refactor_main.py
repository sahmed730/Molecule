import re

with open("main.py", "r", encoding="utf-8") as f:
    content = f.read()

# Add imports for Database and Auth
new_imports = """
from fastapi import Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import database, models, auth

# Create database tables
models.Base.metadata.create_all(bind=database.engine)
"""
content = content.replace("from dotenv import load_dotenv\n\nload_dotenv()", "from dotenv import load_dotenv\n\nload_dotenv()\n" + new_imports)

# We need to protect the routes. We'll find all definitions like `def api_` and add `user: models.User = Depends(auth.get_current_user)`
# But it's easier to just add it manually via regex to all endpoints inside main.py that have @app.post

def inject_depends(match):
    declaration = match.group(0)
    if "def " in declaration:
        # Avoid injecting into auth endpoints if they already existed (they don't yet)
        if "req:" in declaration:
            return declaration.replace("req:", "req: ", 1).replace(")", ", current_user: models.User = Depends(auth.get_current_user))")
        else:
            return declaration.replace(")", "current_user: models.User = Depends(auth.get_current_user))")
    return declaration

# Actually, the endpoints are specifically:
# @app.post("/api/classify-system")
# def api_classify_system(req: ClassifyRequest):
# We can just match `def api_(.*?)\):`
content = re.sub(r"def api_[a-zA-Z0-9_]+\(.*?\):", inject_depends, content)

# Also we need to add the Auth routes and Project routes
auth_routes = """
# ── Auth & Project Endpoints ────────────────────────────────

class UserCreate(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str

@app.post("/api/auth/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/auth/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user.id, "email": user.email}}

class ProjectCreate(BaseModel):
    name: str
    nodes_json: str
    edges_json: str

class ProjectResponse(BaseModel):
    id: int
    name: str
    nodes_json: str
    edges_json: str

@app.post("/api/projects", response_model=ProjectResponse)
def create_project(project: ProjectCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    new_project = models.Project(
        name=project.name, 
        nodes_json=project.nodes_json, 
        edges_json=project.edges_json, 
        owner_id=current_user.id
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project

@app.get("/api/projects")
def get_projects(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    projects = db.query(models.Project).filter(models.Project.owner_id == current_user.id).all()
    return projects

@app.put("/api/projects/{project_id}")
def update_project(project_id: int, project: ProjectCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    db_project = db.query(models.Project).filter(models.Project.id == project_id, models.Project.owner_id == current_user.id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    db_project.name = project.name
    db_project.nodes_json = project.nodes_json
    db_project.edges_json = project.edges_json
    db.commit()
    return {"status": "success"}
"""

content = content.replace("# ── Endpoints ───────────────────────────────────────────────", auth_routes + "\n# ── Endpoints ───────────────────────────────────────────────")

with open("main_refactored.py", "w", encoding="utf-8") as f:
    f.write(content)
