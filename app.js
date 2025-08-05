// Import necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const multer = require('multer'); // For handling file uploads
const admin = require('firebase-admin'); // For Firebase Admin SDK
const fs = require('fs'); // Node.js File System module for deleting files

// ---------------------------------------------------------------------
// PLACE THE PROVIDED CODE BLOCK HERE:
// Initialize Firebase Admin SDK
// IMPORTANT: Read service account config from environment variable
// This is crucial for deployment platforms like Render
let serviceAccount;
try {
    // Attempt to parse from environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CONFIG);
} catch (e) {
    console.error("Error parsing FIREBASE_ADMIN_SDK_CONFIG environment variable:", e);
    console.error("Attempting to load from local file (for development only): ./firebase-adminsdk.json");
    try {
        // Fallback for local development if env var is not set
        serviceAccount = require('./firebase-adminsdk.json');
    } catch (localError) {
        console.error("Error loading local firebase-adminsdk.json:", localError);
        console.error("Firebase Admin SDK initialization failed. Application may not function correctly.");
        process.exit(1);
    }
}

if (!serviceAccount) {
    console.error("Firebase Admin SDK service account configuration is missing. Exiting.");
    process.exit(1);
}
// ---------------------------------------------------------------------

// Initialize the Firebase Admin SDK with the loaded service account
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // databaseURL: "https://your-project-id.firebaseio.com" // Uncomment if you have a specific database URL
});

const db = admin.firestore(); // Now you can get a Firestore instance

// Initialize the Express application
const app = express();
const PORT = 3000;

// ... rest of your app.js code (session setup, middleware, routes, etc.)
// --- Session Middleware Setup ---
app.use(session({
    secret: 'your_super_secret_key_for_admin_app', // CHANGE THIS IN PRODUCTION!
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Middleware to parse URL-encoded bodies (from HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));
// Middleware to parse JSON bodies (if you send JSON from frontend)
app.use(bodyParser.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Multer Setup for File Uploads ---
// Configure storage for uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Files will be saved in 'public/uploads/'
        // Make sure this directory exists in your 'public' folder!
        const uploadPath = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Use the original filename, but ensure it's unique by prepending a timestamp
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- User Credentials ---
const VALID_USERNAME = 'nightowls';
const VALID_PASSWORD = '123456';

const ADMIN_USERNAME = 'mounica';
const ADMIN_PASSWORD = 'mentalmounica'; // CHANGE THIS IN PRODUCTION!

// --- Authentication Middleware ---
function isAuthenticated(req, res, next) {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.redirect('/?error=unauthorized');
    }
}

// --- Admin Authorization Middleware ---
function isAdmin(req, res, next) {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(403).send('Access Denied: Administrators only.');
    }
}

// --- Routes ---

// Login Route
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        req.session.isAuthenticated = true;
        req.session.isAdmin = false; // Regular user
        console.log('Login successful for regular user:', username);
        res.redirect('/home');
    } else if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        req.session.isAdmin = true; // Admin user
        console.log('Login successful for admin user:', username);
        res.redirect('/admin'); // Redirect to admin page
    } else {
        console.log('Login failed for user:', username);
        res.redirect('/?error=invalid');
    }
});

// Protected Home Page Route
app.get('/home', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'home.html'));
});

// Protected Work Page (Syllabus) Route
app.get('/work', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'work.html'));
});

// Protected Codes Page Route
app.get('/codes', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'codes.html'));
});

// Protected Admin Page Route
app.get('/admin', isAuthenticated, isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// API to get subjects and topics for dropdowns (for admin page)
app.get('/api/subjects-topics', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const subjectsRef = db.collection('subjects');
        const snapshot = await subjectsRef.get();
        const subjects = [];
        snapshot.forEach(doc => {
            subjects.push({ id: doc.id, name: doc.data().name, topics: doc.data().topics || [] });
        });
        res.json(subjects);
    } catch (error) {
        console.error('Error fetching subjects and topics:', error);
        res.status(500).json({ error: 'Failed to fetch subjects and topics.' });
    }
});

// NEW API: To get documents by subject and optionally by topic (for codes page)
app.get('/api/documents', isAuthenticated, async (req, res) => {
    try {
        const { subjectId, topic } = req.query; // Get subjectId and topic from query parameters

        if (!subjectId) {
            return res.status(400).json({ error: 'Subject ID is required.' });
        }

        let query = db.collection('documents').where('subject', '==', subjectId);

        if (topic) {
            query = query.where('topic', '==', topic);
        }

        const snapshot = await query.get();
        const documents = [];
        snapshot.forEach(doc => {
            documents.push({
                id: doc.id,
                name: doc.data().name,
                filePath: doc.data().filePath, // This is the path relative to 'public'
                topic: doc.data().topic,
                subject: doc.data().subject
            });
        });
        res.json(documents);
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents.' });
    }
});


// API to handle document uploads
app.post('/upload-document', isAuthenticated, isAdmin, upload.single('documentFile'), async (req, res) => {
    try {
        const { subject, topic, documentName } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).send('No file uploaded.');
        }

        if (!subject || !topic || !documentName) {
            // If any required field is missing, delete the uploaded file
            fs.unlinkSync(file.path);
            return res.status(400).send('Subject, Topic, and Document Name are required.');
        }

        // Store document metadata in Firestore
        await db.collection('documents').add({
            subject: subject, // Storing subject ID
            topic: topic,
            name: documentName,
            filePath: '/uploads/' + file.filename, // Path accessible from public folder
            uploadedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).send('Document uploaded and metadata saved successfully!');
    } catch (error) {
        console.error('Error uploading document:', error);
        // Ensure file is deleted if there's a Firestore error
        if (req.file && req.file.path) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).send('Failed to upload document.');
    }
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/home');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to access the login page.`);
});
