
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = 3000;

app.use(cors({
    origin:"https://7930navid.github.io/asirnet"
}));
app.use(bodyParser.json());

const SECRET = 'asirnetsecret';

// ===== In-memory DB =====
let users = []; // {id, username, password}
let posts = []; // {id, userId, username, content}

// ===== Auth Middleware =====
function authMiddleware(req, res, next){                                                                                                                                                const auth = req.headers['authorization'];
    if(!auth) return res.status(401).json({error:'No token'});
    const token = auth.split(' ')[1];
    try{
        const data = jwt.verify(token, SECRET);
        req.user = data;
        next();
    } catch(e){ res.status(401).json({error:'Invalid token'}); }
}

// ===== Register/Login =====
app.post('/register', (req,res)=>{
    const {username,password} = req.body;
    if(!username || !password) return res.status(400).json({error:'Provide username & password'});
    if(users.find(u=>u.username===username)) return res.status(400).json({error:'User exists'});
    const id = Date.now().toString();
    users.push({id, username, password});
    res.json({message:'Registered!'});
});

app.post('/login', (req,res)=>{
    const {username,password} = req.body;
    const user = users.find(u=>u.username===username && u.password===password);
    if(!user) return res.status(400).json({error:'Invalid credentials: No such account or password is incorrect!!'});
    const token = jwt.sign({id:user.id, username:user.username}, SECRET);
    res.json({token});
});

app.get('/me', authMiddleware, (req,res)=>{
    const user = users.find(u=>u.id===req.user.id);
    if(!user) return res.status(404).json({error:'User not found'});
    res.json({id:user.id, username:user.username});
});


// ===== Get all users (safe version) =====
app.get('/users', (req, res) => {
    const safeUsers = users.map(u => ({
        id: u.id,
        username: u.username
    }));
    res.json(safeUsers);
});

// ===== Users Update/Delete =====
app.put('/users/:id', authMiddleware, (req,res)=>{
    if(req.params.id!==req.user.id) return res.status(403).json({error:'Forbidden'});
    const user = users.find(u=>u.id===req.user.id);
    if(!user) return res.status(404).json({error:'User not found'});
    if(req.body.username) user.username = req.body.username;
    if(req.body.password) user.password = req.body.password;
    res.json({message:'Yoir Account Updated'});
});

app.delete('/users/:id', authMiddleware, (req,res)=>{
    if(req.params.id!==req.user.id) return res.status(403).json({error:'Forbidden'});
    users = users.filter(u=>u.id!==req.user.id);
    posts = posts.filter(p=>p.userId!==req.user.id);
    res.json({message:'Deleted'});
});

// ===== Posts =====
app.get('/posts', (req,res)=>{
    res.json(posts);
});

app.post('/posts', authMiddleware, (req,res)=>{
    const {content} = req.body;
    if(!content) return res.status(400).json({error:'No content'});
    const post = {id:Date.now().toString(), userId:req.user.id, username:req.user.username, content};
    posts.push(post);
    res.json(post);
});

app.put('/posts/:id', authMiddleware, (req,res)=>{
    const post = posts.find(p=>p.id===req.params.id);
    if(!post) return res.status(404).json({error:'Post not found'});
    if(post.userId!==req.user.id) return res.status(403).json({error:'Forbidden'});
    if(req.body.content) post.content=req.body.content;
    res.json(post);
});

app.delete('/posts/:id', authMiddleware, (req,res)=>{
    const post = posts.find(p=>p.id===req.params.id);
    if(!post) return res.status(404).json({error:'Post not found'});
    if(post.userId!==req.user.id) return res.status(403).json({error:'Forbidden'});
    posts = posts.filter(p=>p.id!==req.params.id);
    res.json({message:'Post deleted'});
});

app.listen(PORT, ()=>console.log(`Server running at http://localhost:${PORT}`));
