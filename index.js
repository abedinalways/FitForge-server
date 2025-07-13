const express = require('express');
const cors=require('cors')
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 3000;


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
      res.send(result);
    });
    //all classes api
    app.get('/allClasses', async (req, res) => {
      const cursor = classCollection.find();
      const result = await cursor.toArray();
      res.send(result);
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


    // Payment booking API with Stripe integration
    app.post('/payment-booking', async (req, res) => {
      try {
        const paymentData = req.body;

        // Save payment information to database
        const result = await paymentCollection.insertOne({
          ...paymentData,
          createdAt: new Date(),
        });

        // If payment is successful, increase booking count
        if (paymentData.status === 'completed') {
          // Find the class/package and increment booking count
          const classFilter = { _id: new ObjectId(paymentData.packageId) };
          const updateDoc = {
            $inc: { bookings: 1 },
          };

          await classCollection.updateOne(classFilter, updateDoc);

          // Update trainer's booking count if needed
          const trainerFilter = { _id: new ObjectId(paymentData.trainerId) };
          const trainerUpdateDoc = {
            $inc: { totalBookings: 1 },
          };

          await trainerCollection.updateOne(trainerFilter, trainerUpdateDoc);
        }

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
