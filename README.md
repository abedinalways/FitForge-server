FitForge Server

The backend of FitForge, a fitness platform, powers the API for trainer applications, user authentication, and fitness-related features. Built with Node.js, Express, and MongoDB, it integrates Firebase Authentication and Stripe for payments, ensuring a secure and scalable server.

Features





Trainer Application API: Handles trainer application submissions and status updates (pending, approved, rejected).



Activity Log: Provides application history for members via a secure endpoint.



Authentication: Integrates Firebase Authentication with custom JWT for secure access.



Role-Based Access: Supports member, trainer, and admin roles with restricted endpoints.



Payment Processing: Stripe integration for booking trainers.



MongoDB Integration: Stores users, applications, classes, and transactions.

Tech Stack





Runtime: Node.js



Framework: Express



Database: MongoDB (MongoDB Atlas)



Authentication: Firebase Admin SDK, JSON Web Tokens (JWT)



Password Hashing: bcryptjs



Payments: Stripe



Environment: dotenv



Other: CORS for cross-origin requests

Prerequisites





Node.js (v16 or higher)



MongoDB Atlas account or local MongoDB instance



Firebase project with Admin SDK credentials



Stripe account for payment processing

Installation





Clone the Repository:

git clone https://github.com/Programming-Hero-Web-Course4/b11a12-server-side-abedinalways.git
cd fitforge-server



Install Dependencies:

npm install express cors jsonwebtoken bcryptjs firebase-admin mongodb stripe dotenv



Set Up Environment Variables:





Create a .env file in the root directory based on .env.example:

PORT=3000
DB_USER=your_mongodb_user
DB_PASS=your_mongodb_password
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret



Set Up Firebase Admin SDK:





Create a Firebase project at console.firebase.google.com.



Generate an Admin SDK private key and save it as firebase-admin-key.json in the root directory.



Connect to MongoDB:





Ensure your MongoDB Atlas URI is correct in the .env file:

DB_USER=your_username
DB_PASS=your_password



Alternatively, use a local MongoDB instance: mongodb://localhost:5173/FitForge.



Start the Server:

node server.js





The API will be available at [http://localhost:3000.](https://fitforge-sage.vercel.app/)

Usage





Authentication:





Use POST /auth/firebase to exchange Firebase ID tokens for custom JWTs.



Store the JWT in the frontend localStorage for API requests.



Trainer Applications:





POST /apply-trainer: Submit trainer applications (requires member role).



GET /activity-log: Fetch application history for the logged-in member.



GET /applied-trainers: List all applications (admin only).



PUT /applied-trainers/:id/confirm: Approve an application (admin only).



PUT /applied-trainers/:id/reject: Reject an application (admin only).



Test Endpoints:





Use Postman or curl to test APIs, e.g.:

curl -X POST http://localhost:3000/apply-trainer \
-H "Authorization: Bearer <your_jwt_token>" \
-H "Content-Type: application/json" \
-d '{"specialization":"Yoga","experience":5,"certifications":"ACE Certified","bio":"Test bio","availableDays":["Monday"],"availableTimes":"9:00 AM - 6:00 PM","salaryExpectation":3000}'

Project Structure

fitforge-backend/
├── firebase-admin-key.json  # Firebase Admin SDK credentials
├── server.js               # Main server file
├── .env                    # Environment variables
├── package.json            # Dependencies and scripts
└── README.md               # This file

API Endpoints





POST /auth/firebase: Exchange Firebase ID token for JWT.



POST /apply-trainer: Submit trainer application.



GET /activity-log: Fetch member’s trainer application history.



GET /applied-trainers: List all trainer applications (admin only).



PUT /applied-trainers/:id/confirm: Approve a trainer application.



PUT /applied-trainers/:id/reject: Reject a trainer application.



POST /create-payment-intent: Create a Stripe payment intent.



GET /classes: List fitness classes.

Contributing

Contributions are welcome! To contribute:





Fork the repository.



Create a feature branch: git checkout -b feature/your-feature.



Commit changes: git commit -m "Add your feature".



Push to the branch: git push origin feature/your-feature.



Open a pull request with a clear description.
