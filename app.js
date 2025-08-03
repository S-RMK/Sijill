// Import necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session'); // Import express-session

// Initialize the Express application
const app = express();
const PORT = 3000; // Define the port for the server to listen on

// --- Session Middleware Setup ---
// Configure session middleware. This creates a session for each user.
app.use(session({
    secret: 'your_super_secret_key', // A secret to sign the session ID cookie. CHANGE THIS IN PRODUCTION!
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // Session lasts for 24 hours
    }
}));

// Middleware to parse URL-encoded bodies (from HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the 'public' directory (only for files like index.html, CSS, JS, images, PDFs)
app.use(express.static(path.join(__dirname, 'public')));

// Hardcoded credentials for demonstration purposes
const VALID_USERNAME = 'nightowls';
const VALID_PASSWORD = '123456';

// --- Authentication Middleware ---
// This middleware checks if the user is authenticated.
function isAuthenticated(req, res, next) {
    if (req.session.isAuthenticated) {
        next(); // User is authenticated, proceed to the next middleware/route handler
    } else {
        res.redirect('/?error=unauthorized'); // User is not authenticated, redirect to login page
    }
}

// --- Routes ---

// Route to handle login form submission
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        req.session.isAuthenticated = true; // Set session variable on successful login
        console.log('Login successful for user:', username);
        res.redirect('/home'); // Redirect to the protected home route
    } else {
        console.log('Login failed for user:', username);
        res.redirect('/?error=invalid'); // Redirect back to login with error
    }
});

// Protected Home Page Route
app.get('/home', isAuthenticated, (req, res) => {
    // If isAuthenticated middleware passes, serve the home.html file
    res.sendFile(path.join(__dirname, 'views', 'home.html'));
});

// Protected Work Page Route
app.get('/work', isAuthenticated, (req, res) => {
    // If isAuthenticated middleware passes, serve the work.html file
    res.sendFile(path.join(__dirname, 'views', 'work.html'));
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(err => { // Destroy the session
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/home'); // Or an error page
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.redirect('/'); // Redirect to the login page
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to access the login page.`);
});
