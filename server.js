require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const Task = require('./models/Task');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// Read MongoDB URI from environment (.env). Support either MONGODB_URI or legacy URI var.
const MONGODB_URI = process.env.MONGODB_URI || process.env.URI || 'mongodb+srv://s1347969:3024@cluster0.ypkudjv.mongodb.net/taskmanager?retryWrites=true&w=majority&appName=Cluster0';
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database connection


mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected to Atlas cluster: Cluster0');
    console.log('📊 Database: taskmanager');
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// Authentication Middleware
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// Admin-only Middleware
const requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.username !== 'admin') {
    return res.status(403).send('Access denied. Only admin users can manage users.');
  }
  next();
};

// Routes
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

// Login Routes
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.render('login', { error: 'Username and password are required' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    req.session.user = { username: user.username, _id: user._id.toString() };
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'An error occurred. Please try again.' });
  }
});

// Sign-up Routes
app.get('/signup', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('signup', { error: null });
});

app.post('/signup', async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.render('signup', { error: 'Username and password are required' });
  }

  if (password.length < 6) {
    return res.render('signup', { error: 'Password must be at least 6 characters long' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('signup', { error: 'Username already exists' });
    }

    const user = new User({ username, password, email });
    await user.save();

    req.session.user = { username: user.username, _id: user._id.toString() };
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === 11000) {
      return res.render('signup', { error: 'Username already exists' });
    }
    res.render('signup', { error: 'An error occurred. Please try again.' });
  }
});

// Logout Route
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Dashboard Route
app.get('/dashboard', requireAuth, (req, res) => {
  res.render('dashboard', { user: req.session.user });
});

// Tasks Routes
app.get('/tasks', requireAuth, async (req, res) => {
  try {
    // non-admin users should only see their own tasks
    const query = (req.session.user && req.session.user.username === 'admin') ? {} : { createdBy: req.session.user._id };
    const tasks = await Task.find(query).sort({ createdAt: -1 });
    res.render('tasks', { tasks, user: req.session.user, error: null });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.render('tasks', { tasks: [], user: req.session.user, error: 'Error loading tasks' });
  }
});

// Create Task Route
app.get('/tasks/create', requireAuth, (req, res) => {
  res.render('task-form', { task: null, user: req.session.user, mode: 'create', error: null });
});

app.post('/tasks/create', requireAuth, async (req, res) => {
  const { title, description, priority, status } = req.body;

  if (!title) {
    return res.render('task-form', { 
      task: null, 
      user: req.session.user, 
      mode: 'create',
      error: 'Title is required' 
    });
  }

  try {
    const task = new Task({
      title,
      description: description || '',
      priority: priority || 'medium',
      status: status || 'pending',
      createdBy: req.session.user._id
    });
    await task.save();
    res.redirect('/tasks');
  } catch (error) {
    console.error('Error creating task:', error);
    res.render('task-form', { 
      task: null, 
      user: req.session.user, 
      mode: 'create',
      error: 'Error creating task' 
    });
  }
});

// Edit Task Route
app.get('/tasks/edit/:id', requireAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.redirect('/tasks');
    }
    if (task.createdBy && task.createdBy.toString() !== req.session.user._id && req.session.user.username !== 'admin') {
      return res.status(403).send('Access denied. You may only edit your own tasks.');
    }
    res.render('task-form', { task: task, user: req.session.user, mode: 'edit', error: null });
  } catch (error) {
    console.error('Error fetching task:', error);
    res.redirect('/tasks');
  }
});

app.post('/tasks/edit/:id', requireAuth, async (req, res) => {
  const { title, description, priority, status } = req.body;

  if (!title) {
    const task = await Task.findById(req.params.id);
    return res.render('task-form', { 
      task: task, 
      user: req.session.user, 
      mode: 'edit',
      error: 'Title is required' 
    });
  }

  try {
    // ensure ownership before update
    const existing = await Task.findById(req.params.id);
    if (!existing) return res.redirect('/tasks');
    if (existing.createdBy && existing.createdBy.toString() !== req.session.user._id && req.session.user.username !== 'admin') {
      return res.status(403).send('Access denied. You may only edit your own tasks.');
    }

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, priority, status },
      { new: true }
    );

    if (!task) {
      return res.redirect('/tasks');
    }

    res.redirect('/tasks');
  } catch (error) {
    console.error('Error updating task:', error);
    res.redirect('/tasks');
  }
});

// Delete Task Route
app.post('/tasks/delete/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Task.findById(req.params.id);
    if (!existing) return res.redirect('/tasks');
    if (existing.createdBy && existing.createdBy.toString() !== req.session.user._id && req.session.user.username !== 'admin') {
      return res.status(403).send('Access denied. You may only delete your own tasks.');
    }
    await Task.findByIdAndDelete(req.params.id);
    res.redirect('/tasks');
  } catch (error) {
    console.error('Error deleting task:', error);
    res.redirect('/tasks');
  }
});

// Protected API Routes
app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const query = (req.session.user && req.session.user.username === 'admin') ? {} : { createdBy: req.session.user._id };
    const tasks = await Task.find(query).sort({ createdAt: -1 });
    return res.json(tasks);
  } catch (err) {
    return res.status(500).json({ error: 'Unable to fetch tasks' });
  }
});

app.get('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.createdBy && task.createdBy.toString() !== req.session.user._id && req.session.user.username !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    return res.json(task);
  } catch (err) {
    return res.status(500).json({ error: 'Unable to fetch task' });
  }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  const { title, description, priority = 'medium', status = 'pending' } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const newTask = new Task({ title, description, priority, status, createdBy: req.session.user._id });
    const saved = await newTask.save();
    return res.status(201).json(saved);
  } catch (err) {
    return res.status(500).json({ error: 'Unable to create task' });
  }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Task.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (existing.createdBy && existing.createdBy.toString() !== req.session.user._id && req.session.user.username !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const updated = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: 'Unable to update task' });
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Task.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (existing.createdBy && existing.createdBy.toString() !== req.session.user._id && req.session.user.username !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    const deleted = await Task.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    return res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Unable to delete task' });
  }
});

// RESTful CRUD APIs for Users (No Authentication Required)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({ error: 'Unable to fetch users' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    return res.status(500).json({ error: 'Unable to fetch user' });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, email } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    const user = new User({ username, password, email });
    const saved = await user.save();
    const userResponse = saved.toObject();
    delete userResponse.password;
    
    return res.status(201).json(userResponse);
  } catch (err) {
    console.error('Error creating user:', err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    return res.status(500).json({ error: 'Unable to create user' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { username, password, email } = req.body;
  
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    
    if (username && (username.length < 3 || username.length > 30)) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
    }
    
    if (password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: req.params.id } });
      if (existingUser) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }
    
    const update = {};
    if (username) update.username = username;
    if (password) update.password = password;
    if (email !== undefined) update.email = email;
    
    const updated = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userResponse = updated.toObject();
    delete userResponse.password;
    return res.json(userResponse);
  } catch (err) {
    console.error('Error updating user:', err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    return res.status(500).json({ error: 'Unable to update user' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }
    
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    return res.status(500).json({ error: 'Unable to delete user' });
  }
});

// User Management Web Pages (Admin Only)
app.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.render('users', { users, user: req.session.user, error: null });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.render('users', { users: [], user: req.session.user, error: 'Error loading users' });
  }
});

app.get('/users/create', requireAdmin, (req, res) => {
  res.render('user-form', { userData: null, user: req.session.user, mode: 'create', error: null });
});

app.post('/users/create', requireAdmin, async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.render('user-form', { 
      userData: null, 
      user: req.session.user, 
      mode: 'create',
      error: 'Username and password are required' 
    });
  }

  if (password.length < 6) {
    return res.render('user-form', { 
      userData: null, 
      user: req.session.user, 
      mode: 'create',
      error: 'Password must be at least 6 characters long' 
    });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('user-form', { 
        userData: null, 
        user: req.session.user, 
        mode: 'create',
        error: 'Username already exists' 
      });
    }

    const newUser = new User({ username, password, email });
    await newUser.save();
    res.redirect('/users');
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.code === 11000) {
      return res.render('user-form', { 
        userData: null, 
        user: req.session.user, 
        mode: 'create',
        error: 'Username already exists' 
      });
    }
    res.render('user-form', { 
      userData: null, 
      user: req.session.user, 
      mode: 'create',
      error: 'Error creating user' 
    });
  }
});

app.get('/users/edit/:id', requireAdmin, async (req, res) => {
  try {
    const userData = await User.findById(req.params.id).select('-password');
    if (!userData) {
      return res.redirect('/users');
    }
    res.render('user-form', { userData: userData, user: req.session.user, mode: 'edit', error: null });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.redirect('/users');
  }
});

app.post('/users/edit/:id', requireAdmin, async (req, res) => {
  const { username, password, email } = req.body;

  if (!username) {
    const userData = await User.findById(req.params.id).select('-password');
    return res.render('user-form', { 
      userData: userData, 
      user: req.session.user, 
      mode: 'edit',
      error: 'Username is required' 
    });
  }

  try {
    const existingUser = await User.findOne({ username, _id: { $ne: req.params.id } });
    if (existingUser) {
      const userData = await User.findById(req.params.id).select('-password');
      return res.render('user-form', { 
        userData: userData, 
        user: req.session.user, 
        mode: 'edit',
        error: 'Username already exists' 
      });
    }

    const update = { username, email };
    if (password && password.length > 0) {
      if (password.length < 6) {
        const userData = await User.findById(req.params.id).select('-password');
        return res.render('user-form', { 
          userData: userData, 
          user: req.session.user, 
          mode: 'edit',
          error: 'Password must be at least 6 characters long' 
        });
      }
      update.password = password;
    }

    const updated = await User.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) {
      return res.redirect('/users');
    }

    res.redirect('/users');
  } catch (error) {
    console.error('Error updating user:', error);
    if (error.code === 11000) {
      const userData = await User.findById(req.params.id).select('-password');
      return res.render('user-form', { 
        userData: userData, 
        user: req.session.user, 
        mode: 'edit',
        error: 'Username already exists' 
      });
    }
    res.redirect('/users');
  }
});

app.post('/users/delete/:id', requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/users');
  } catch (error) {
    console.error('Error deleting user:', error);
    res.redirect('/users');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} — http://localhost:${PORT}`);
});
