const express = require('express');
const cors=require('cors')
const app = express();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 3000;

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FB_SERVICE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});



//middleware
app.use(cors());
app.use(express.json())

// JWT Middleware
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).send({ error: 'Unauthorized: Please log in' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ error: 'Invalid or expired token' });
  }
};

// Role-based Middleware
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).send({ error: 'Access denied: Insufficient permissions' });
    }
    next();
  };
};


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4oy8t6b.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const userCollection = client.db('FitForge').collection('users');
    const appliedTrainersCollection = client
      .db('FitForge')
      .collection('appliedTrainers');
    const classCollection = client.db('FitForge').collection('Classes');
    const slotsCollection = client.db('FitForge').collection('slots');
    const transactionsCollection = client
      .db('FitForge')
      .collection('transactions');
    const reviewCollection = client.db('FitForge').collection('Reviews');
    const postCollection = client.db('FitForge').collection('posts');
    const subscriberCollection = client.db('FitForge').collection('subscriber');
    const trainerCollection = client.db('FitForge').collection('AllTrainer');
    const paymentCollection = client.db('FitForge').collection('Payments');

    // Exchange Firebase ID token for custom JWT
    app.post('/auth/firebase', async (req, res) => {
      try {
        const { idToken } = req.body;
        if (!idToken) {
          return res.status(400).send({ error: 'Firebase ID token required' });
        }

        // Verify Firebase ID token
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const firebaseUid = decodedToken.uid;
        const email = decodedToken.email;

        // Find or create user in MongoDB
        let user = await userCollection.findOne({ firebaseUid });
        if (!user) {
          user = {
            firebaseUid,
            email,
            name: decodedToken.name || email.split('@')[0],
            role: 'member', // Default role
            createdAt: new Date(),
            lastLogin: new Date(),
          };
          await userCollection.insertOne(user);
        } else {
          await userCollection.updateOne(
            { firebaseUid },
            { $set: { lastLogin: new Date() } }
          );
        }

        // Generate custom JWT
        const jwtToken = jwt.sign(
          { userId: user._id.toString(), firebaseUid, email, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        res.send({
          token: jwtToken,
          user: { id: user._id, email, name: user.name, role: user.role },
        });
      } catch (error) {
        res.status(401).send({ error: 'Invalid Firebase token' });
      }
    });

    // Register user
    app.post('/register', async (req, res) => {
      try {
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
          return res
            .status(400)
            .send({ error: 'Email, password, and name are required' });
        }

        // Check if user exists
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).send({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = {
          email,
          password: hashedPassword,
          name,
          role: 'member', // Default role
          createdAt: new Date(),
          lastLogin: new Date(),
        };
        const result = await userCollection.insertOne(newUser);

        // Generate JWT
        const token = jwt.sign(
          { userId: result.insertedId.toString(), email, role: newUser.role },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        res.send({
          token,
          user: { id: result.insertedId, email, name, role: newUser.role },
        });
      } catch (error) {
        res.status(500).send({ error: 'Failed to register user' });
      }
    });

    // Login user
    app.post('/login', async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          return res
            .status(400)
            .send({ error: 'Email and password are required' });
        }

        // Find user
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(401).send({ error: 'Invalid credentials' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).send({ error: 'Invalid credentials' });
        }

        // Generate JWT
        const token = jwt.sign(
          { userId: user._id.toString(), email, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );
        await userCollection.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } }
        );

        res.send({
          token,
          user: { id: user._id, email, name: user.name, role: user.role },
        });
      } catch (error) {
        res.status(500).send({ error: 'Failed to login' });
      }
    });

    // Fetch Current User (Protected)
    app.get('/me', verifyToken, async (req, res) => {
      const user = await userCollection.findOne({
        _id: new ObjectId(req.user.userId),
      });
      if (!user) return res.status(404).send({ error: 'User not found' });

      res.send({
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      });
    });

    // Only Admin can access this
    app.get(
      '/admin/dashboard',
      verifyToken,
      requireRole('admin'),
      async (req, res) => {
        res.send({ message: 'Welcome Admin!' });
      }
    );

    // Trainer only route
    app.get(
      '/trainer/dashboard',
      verifyToken,
      requireRole('trainer'),
      async (req, res) => {
        res.send({ message: 'Welcome Trainer!' });
      }
    );

    // Member only route
    app.get(
      '/member/dashboard',
      verifyToken,
      requireRole('member'),
      async (req, res) => {
        res.send({ message: 'Welcome Member!' });
      }
    );

    // Newsletter Subscribers
    app.get('/newsletter', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const subscribers = await subscriberCollection.find().toArray();
      res.send(subscribers);
    });

    // All Trainers
    app.get('/trainers', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const trainers = await userCollection.find({ role: 'trainer' }).toArray();
      res.send(trainers);
    });

    // Delete Trainer (Change role to member)
    app.put('/trainers/:id', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const trainerId = req.params.id;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(trainerId) },
        { $set: { role: 'member' } }
      );
      res.send(result);
    });

    // Applied Trainers
    app.get('/applied-trainers', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const applications = await appliedTrainersCollection.find().toArray();
      res.send(applications);
    });

    // Trainer Application Details
    app.get('/applied-trainers/:id', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const application = await appliedTrainersCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!application) {
        return res.status(404).send({ error: 'Application not found' });
      }
      res.send(application);
    });

    // Confirm Trainer Application
    app.put('/applied-trainers/:id/confirm', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const application = await appliedTrainersCollection.findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!application) {
        return res.status(404).send({ error: 'Application not found' });
      }
      await userCollection.updateOne(
        { _id: new ObjectId(application.userId) },
        { $set: { role: 'trainer' } }
      );
      await trainerCollection.insertOne({
        ...application.applicationDetails,
        userId: application.userId,
        createdAt: new Date(),
      });
      await appliedTrainersCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send({ success: true });
    });

    // Reject Trainer Application
    app.put('/applied-trainers/:id/reject', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const { rejectionReason } = req.body;
      if (!rejectionReason) {
        return res.status(400).send({ error: 'Rejection reason required' });
      }
      await appliedTrainersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: 'rejected', rejectionReason, updatedAt: new Date() } }
      );
      res.send({ success: true });
    });

    // Apply as Trainer
    app.post('/apply-trainer', verifyToken, async (req, res) => {
      if (req.user.role !== 'member') {
        return res
          .status(403)
          .send({ error: 'Only members can apply as trainers' });
      }
      const applicationData = {
        userId: new ObjectId(req.user.userId),
        applicationDetails: req.body,
        status: 'pending',
        appliedAt: new Date(),
      };
      const result = await appliedTrainersCollection.insertOne(applicationData);
      res.send(result);
    });

    // Balance and Transactions
    app.get('/balance', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const totalBalance = await transactionsCollection
        .aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
        .toArray();
      const transactions = await transactionsCollection
        .find()
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      const subscribersCount = await subscriberCollection.countDocuments();
      const paidMembersCount = await paymentCollection.countDocuments({
        status: 'completed',
      });
      res.send({
        totalBalance: totalBalance[0]?.total || 0,
        transactions,
        subscribersCount,
        paidMembersCount,
      });
    });

    // Add New Class
    app.post('/classes', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const classData = {
        ...req.body,
        bookings: 0,
        createdAt: new Date(),
      };
      const result = await classCollection.insertOne(classData);
      res.send(result);
    });

    // Get All Classes
    app.get('/classes', async (req, res) => {
      const classes = await classCollection.find().toArray();
      res.send(classes);
    });

    // Manage Slots
    app.get('/slots', verifyToken, async (req, res) => {
      if (req.user.role !== 'trainer') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const slots = await slotsCollection
        .find({ trainerId: new ObjectId(req.user.userId) })
        .toArray();
      res.send(slots);
    });

    // Add New Slot
    app.post('/slots', verifyToken, async (req, res) => {
      if (req.user.role !== 'trainer') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const slotData = {
        ...req.body,
        trainerId: new ObjectId(req.user.userId),
        createdAt: new Date(),
      };
      const result = await slotsCollection.insertOne(slotData);
      res.send(result);
    });

    // Delete Slot
    app.delete('/slots/:id', verifyToken, async (req, res) => {
      if (req.user.role !== 'trainer') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const result = await slotsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
        trainerId: new ObjectId(req.user.userId),
      });
      res.send(result);
    });

    // Get single forum post
    app.get('/posts/:id', async (req, res) => {
      try {
        const postId = req.params.id;
        const post = await postCollection.findOne({
          _id: new ObjectId(postId),
        });

        if (!post) {
          return res.status(404).send({ error: 'Post not found' });
        }

        res.send(post);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch post' });
      }
    });
    // Add New Forum Post
    app.post('/posts', verifyToken, async (req, res) => {
      if (!['admin', 'trainer'].includes(req.user.role)) {
        return res.status(403).send({ error: 'Access denied' });
      }
      const postData = {
        ...req.body,
        writer: req.user.email,
        upvotes: [],
        downvotes: [],
        date: new Date(),
      };
      const result = await postCollection.insertOne(postData);
      res.send(result);
    });

    // Activity Log
    app.get('/activity-log', verifyToken, async (req, res) => {
      if (req.user.role !== 'member') {
        return res.status(403).send({ error: 'Access denied' });
      }

      try {
        const applications = await appliedTrainersCollection
          .find({ userId: new ObjectId(req.user.userId) })
          .sort({ appliedAt: -1 })
          .toArray();
        res.send(applications);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch activity log' });
      }
    });

    // Get trainer application details (for admins)
    app.get('/applied-trainers/:id', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).send({ error: 'Access denied' });
      }

      try {
        const application = await appliedTrainersCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        if (!application) {
          return res.status(404).send({ error: 'Application not found' });
        }

        res.send(application);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch application' });
      }
    });

    // Update Profile
    app.put('/profile', verifyToken, async (req, res) => {
      const { name, profilePicture } = req.body;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(req.user.userId) },
        { $set: { name, profilePicture } }
      );
      res.send(result);
    });

    // Get Booked Trainer
    app.get('/booked-trainer', verifyToken, async (req, res) => {
      if (req.user.role !== 'member') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const slots = await slotsCollection
        .find({ bookedBy: new ObjectId(req.user.userId) })
        .toArray();
      res.send(slots);
    });

    // Submit Review
    app.post('/reviews', verifyToken, async (req, res) => {
      if (req.user.role !== 'member') {
        return res.status(403).send({ error: 'Access denied' });
      }
      const reviewData = {
        ...req.body,
        userId: new ObjectId(req.user.userId),
        createdAt: new Date(),
      };
      const result = await reviewCollection.insertOne(reviewData);
      res.send(result);
    });

    // Get posts with pagination
    app.get('/posts', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        const totalPosts = await postCollection.countDocuments();
        const posts = await postCollection
          .find()
          .sort({ date: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          posts,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalPosts / limit),
            totalPosts,
            hasNextPage: page < Math.ceil(totalPosts / limit),
            hasPrevPage: page > 1,
            limit,
          },
        });
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch posts' });
      }
    });

    // Upvote a post
    app.post('/posts/:id/upvote', verifyToken, async (req, res) => {
      try {
        const postId = req.params.id;
        const userId = req.user.userId;
        const post = await postCollection.findOne({
          _id: new ObjectId(postId),
        });

        if (!post) {
          return res.status(404).send({ error: 'Post not found' });
        }

        const upvotes = post.upvotes || [];
        const downvotes = post.downvotes || [];

        if (upvotes.includes(userId)) {
          return res.status(400).send({ error: 'Already upvoted' });
        }

        if (downvotes.includes(userId)) {
          await postCollection.updateOne(
            { _id: new ObjectId(postId) },
            { $pull: { downvotes: userId } }
          );
        }

        const result = await postCollection.updateOne(
          { _id: new ObjectId(postId) },
          { $addToSet: { upvotes: userId }, $set: { downvotes } }
        );

        res.send({ success: true, message: 'Upvoted successfully' });
      } catch (error) {
        res.status(500).send({ error: 'Failed to upvote post' });
      }
    });

    // Downvote a post
    app.post('/posts/:id/downvote', verifyToken, async (req, res) => {
      try {
        const postId = req.params.id;
        const userId = req.user.userId;
        const post = await postCollection.findOne({
          _id: new ObjectId(postId),
        });

        if (!post) {
          return res.status(404).send({ error: 'Post not found' });
        }

        const upvotes = post.upvotes || [];
        const downvotes = post.downvotes || [];

        if (downvotes.includes(userId)) {
          return res.status(400).send({ error: 'Already downvoted' });
        }

        if (upvotes.includes(userId)) {
          await postCollection.updateOne(
            { _id: new ObjectId(postId) },
            { $pull: { upvotes: userId } }
          );
        }

        const result = await postCollection.updateOne(
          { _id: new ObjectId(postId) },
          { $addToSet: { downvotes: userId }, $set: { upvotes } }
        );

        res.send({ success: true, message: 'Downvoted successfully' });
      } catch (error) {
        res.status(500).send({ error: 'Failed to downvote post' });
      }
    });

    //classes api
    app.get('/featuredClasses', async (req, res) => {
      const query = {};
      const sortFields = { bookings: -1 };
      const cursor = classCollection.find(query).sort(sortFields).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get('/allClasses', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalClasses = await classCollection.countDocuments();

        // Get classes with pagination
        const cursor = classCollection.find().skip(skip).limit(limit);
        const classes = await cursor.toArray();

        // Calculate pagination info
        const totalPages = Math.ceil(totalClasses / limit);

        res.send({
          classes,
          pagination: {
            currentPage: page,
            totalPages,
            totalClasses,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            limit,
          },
        });
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch classes' });
      }
    });

    app.get('/allClassesComplete', async (req, res) => {
      try {
        const cursor = classCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch all classes' });
      }
    });

    // Get single class by ID
    app.get('/class/:id', async (req, res) => {
      try {
        const classId = req.params.id;
        const classItem = await classCollection.findOne({
          _id: new ObjectId(classId),
        });

        if (!classItem) {
          return res.status(404).send({ error: 'Class not found' });
        }

        res.send(classItem);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch class details' });
      }
    });
    // Get trainers for a specific class
    app.get('/class/:id/trainers', async (req, res) => {
      try {
        const classId = req.params.id;
        const limit = parseInt(req.query.limit) || 5;

        // Fetch class details
        const classItem = await classCollection.findOne({
          _id: new ObjectId(classId),
        });
        if (!classItem) {
          return res.status(404).send({ error: 'Class not found' });
        }

        // Match trainers by expertise
        const trainers = await trainerCollection
          .find({
            expertise: {
              $elemMatch: { $regex: classItem.title, $options: 'i' },
            },
          })
          .limit(limit)
          .toArray();

        res.send(trainers);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch class trainers' });
      }
    });

    // Search classes by name or category
    app.get('/searchClasses', async (req, res) => {
      try {
        const { q, category, page = 1, limit = 6 } = req.query;
        const skip = (page - 1) * limit;

        let query = {};

        if (q) {
          query.$or = [
            { title: new RegExp(q, 'i') },
            { className: new RegExp(q, 'i') },
            { description: new RegExp(q, 'i') },
            { category: new RegExp(q, 'i') },
          ];
        }

        if (category) {
          query.category = new RegExp(category, 'i');
        }

        const totalClasses = await classCollection.countDocuments(query);
        const classes = await classCollection
          .find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        const totalPages = Math.ceil(totalClasses / limit);

        res.send({
          classes,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalClasses,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            limit: parseInt(limit),
          },
        });
      } catch (error) {
        res.status(500).send({ error: 'Failed to search classes' });
      }
    });
    //reviews api
    app.get('/reviews', async (req, res) => {
      const cursor = reviewCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    //Community Posts api
    app.get('/posts', async (req, res) => {
      const cursor = postCollection.find().sort({ date: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    //subscriber
    app.post('/subscriber', async (req, res) => {
      const subscriber = req.body;
      const result = await subscriberCollection.insertOne(subscriber);
      res.send(result);
    });
    // Admin-only Route - Get all subscribers
    app.get('/newsletter-subscriber', verifyToken, async (req, res) => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const subscriber = await subscriberCollection
        .find()
        .project({ name: 1, email: 1, subscribedDate: 1 })
        .toArray();

      res.json(subscriber);
    });
    //team api
    app.get('/team', async (req, res) => {
      const cursor = trainerCollection.find().limit(3);
      const result = await cursor.toArray();
      res.send(result);
    });
    //all trainer api
    app.get('/allTrainer', async (req, res) => {
      const cursor = trainerCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get Booked Trainers for Member
    app.get(
      '/member/booked-trainers',
      verifyToken,
      requireRole('member'),
      async (req, res) => {
        try {
          const bookings = await paymentCollection
            .find({ userId: new ObjectId(req.user.userId) })
            .toArray();

          res.send(bookings);
        } catch (error) {
          res.status(500).send({ error: 'Failed to fetch booked trainers' });
        }
      }
    );

    // Get trainers by specialization
    app.get('/trainersBySpecialization/:specialization', async (req, res) => {
      try {
        const { specialization } = req.params;
        const limit = parseInt(req.query.limit) || 5;

        const trainers = await trainerCollection
          .find({
            $or: [
              { specialization: new RegExp(specialization, 'i') },
              {
                expertise: {
                  $elemMatch: { $regex: specialization, $options: 'i' },
                },
              },
            ],
          })
          .limit(limit)
          .toArray();

        res.send(trainers);
      } catch (error) {
        res
          .status(500)
          .send({ error: 'Failed to fetch trainers by specialization' });
      }
    });
    //trainer details api
    app.get('/allTrainer/:id', async (req, res) => {
      const trainerId = req.params.id;
      const trainer = await trainerCollection.findOne({
        _id: new ObjectId(trainerId),
      });
      res.send(trainer);
    });

    //trainer Booking api
    app.get('/trainer/:id', async (req, res) => {
      const bookingId = req.params.id;
      const booking = await trainerCollection.findOne({
        _id: new ObjectId(bookingId),
      });
      res.send(booking);
    });
    //payment api
    app.get('/payment', async (req, res) => {
      const cursor = paymentCollection.find();
      const payment = await cursor.toArray();
      res.send(payment);
    });
    //payment Detail api
    app.get('/paymentDetail/:id', async (req, res) => {
      const paymentId = req.params.id;
      const paymentDetail = await trainerCollection.findOne({
        _id: new ObjectId(paymentId),
      });
      res.send(paymentDetail);
    });

    app.post('/create-payment-intent', async (req, res) => {
      try {
        const { amount, currency } = req.body;

        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount, // Amount in cents
          currency: currency || 'usd',
          automatic_payment_methods: {
            enabled: true,
          },
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).send({
          error: error.message,
        });
      }
    });

    // Payment booking API
    app.post('/payment-booking', verifyToken, async (req, res) => {
      try {
        const paymentData = req.body;

        // Save payment information to database
        const bookingData = {
          userId: new ObjectId(req.user.userId),
          trainerId: new ObjectId(paymentData.trainerId),
          trainerName: paymentData.trainerName,
          slot: paymentData.slot,
          packageId: new ObjectId(paymentData.packageId),
          packageName: paymentData.packageName,
          price: paymentData.price,
          customerInfo: paymentData.customerInfo,
          paymentDate: new Date(),
          status: 'completed',
        };

        const result = await paymentCollection.insertOne(bookingData);

        res.send({
          success: true,
          message: 'Payment processed successfully',
          paymentId: result.insertedId,
        });
      } catch (error) {
        console.error('Payment booking error:', error);
        res.status(500).send({
          success: false,
          message: 'Payment booking failed',
          error: error.message,
        });
      }
    });

    // Webhook to handle Stripe events
    app.post(
      '/webhook',
      express.raw({ type: 'application/json' }),
      async (req, res) => {
        const sig = req.headers['stripe-signature'];
        let event;

        try {
          event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
          );
        } catch (err) {
          console.log(`Webhook signature verification failed.`, err.message);
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Handle the event
        switch (event.type) {
          case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            console.log('Payment succeeded:', paymentIntent.id);

            // Update payment status in database
            await paymentCollection.updateOne(
              { paymentIntentId: paymentIntent.id },
              { $set: { status: 'completed', updatedAt: new Date() } }
            );
            break;

          case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            console.log('Payment failed:', failedPayment.id);

            // Update payment status in database
            await paymentCollection.updateOne(
              { paymentIntentId: failedPayment.id },
              { $set: { status: 'failed', updatedAt: new Date() } }
            );
            break;

          default:
            console.log(`Unhandled event type ${event.type}`);
        }

        res.send();
      }
    );

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    // console.log(
    //   'Pinged your deployment. You successfully connected to MongoDB!'
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('FitForge Running on vercel');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
