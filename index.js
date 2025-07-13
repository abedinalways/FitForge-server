const express = require('express');
const cors=require('cors')
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.port || 3000;


//middleware
app.use(cors());
app.use(express.json())



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
    const classCollection = client.db('FitForge').collection('Classes');
    const reviewCollection = client.db('FitForge').collection('Reviews');
    const postCollection = client.db('FitForge').collection('posts');
    const subscriberCollection = client.db('FitForge').collection('subscriber');
    const trainerCollection = client.db('FitForge').collection('AllTrainer');
    const paymentCollection = client.db('FitForge').collection('Payments');
    //classes api
    app.get('/featuredClasses', async (req, res) => {
      const query = {};
      const sortFields = { bookings: -1 };
      const cursor = classCollection.find(query).sort(sortFields).limit(6);
      const result = await cursor.toArray();
      res.send(result)
      
    })
    //reviews api
    app.get('/reviews', async (req, res) => {
      const cursor = reviewCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })
    //Community Posts api
    app.get('/posts', async (req, res) => {
      const cursor = postCollection.find().sort({ date: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    })

    //subscriber
    app.post('/subscriber', async (req, res) => {
      const subscriber = req.body;
      const result = await subscriberCollection.insertOne(subscriber);
      res.send(result);
    })
    //team api
    app.get('/team', async (req, res) => {
      const cursor = trainerCollection.find().limit(3);
      const result = await cursor.toArray();
      res.send(result)
    });
    //all trainer api
    app.get('/allTrainer', async (req, res) => {
      const cursor = trainerCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    })
    //trainer details api
    app.get('/allTrainer/:id', async (req, res) => {
      const trainerId = req.params.id;
      const trainer = await trainerCollection.findOne({ _id: new ObjectId(trainerId) });
      res.send(trainer);
    })
    //trainer Booking api
    app.get('/trainer/:id', async (req, res) => {
      const bookingId = req.params.id;
      const booking = await trainerCollection.findOne({ _id: new ObjectId(bookingId) });
      res.send(booking);
    })
    //payment api
    app.get('/payment', async (req, res) => {
      const cursor =  paymentCollection.find();
      const payment = await cursor.toArray();
      res.send(payment);
    });
    //payment Detail api
    app.get('/paymentDetail/:id', async (req, res) => {
      const paymentId = req.params.id;
      const paymentDetail = await trainerCollection.findOne({ _id: new ObjectId(paymentId) });
      res.send(paymentDetail);
    })
    //payment booking api
    
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('FitForge Running');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
