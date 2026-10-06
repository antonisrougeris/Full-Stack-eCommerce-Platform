# Devdromos Server (Part B)

## Team Members
* ANTONIS KOURIS - 3220089
* ANTONIS ROUNGERIS - 3220172
  
Node.js + Express + Firebase backend API for the **Devdromos** application.
This API handles:

- User authentication
- Courses and books catalog
- User enrollments
- Shopping cart & checkout
- Reviews and ratings


## Folder Structure

The code architecture follows the **Controller – Route – Config** pattern for maximum scalability and maintainability.

```text
partb/
└── server/
    ├── src/
    │   ├── controllers/   # Request handling logic
    │   ├── routes/        # API endpoint definitions
    │   ├── middleware/    # Firebase Auth, Validation & Error Handling
    │   ├── config/        # Firebase Admin / Firestore setup
    │   └── app.js         # Main application file
    ├── .env               # Environment variables
    ├── package.json       # Dependencies & scripts
    └── server.js          # Server entry point
```


## Setup & Installation

### 1. Create `.env` File

Inside the `server/` directory, create a file named `.env` and add the following configuration:

```env
PORT=4000
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_WEB_API_KEY=your_firebase_web_api_key
CORS_ORIGIN=http://localhost:5173
```

### 2. Install Dependencies

Run the following command to install all required packages:

```bash
npm install
```



### 3. Start the Server

For development mode with automatic restart:

```bash
npm run dev
```

The server will run at:
**http://localhost:4000**


## API Endpoints

### Authentication (Auth)

| Method | Endpoint | Description |
|-------|----------|-------------|
| POST | /api/auth/register | Register new user & auto login |
| POST | /api/auth/login | Authenticate user & return Firebase ID token |


### Users

| Method | Endpoint | Description |
|-------|----------|-------------|
| GET | /api/users/me | Get logged-in user profile (Protected) |


### Courses

| Method | Endpoint | Description |
|-------|----------|-------------|
| GET | /api/courses | List all courses (filters & search supported) |
| GET | /api/courses/:id | Course details |


### Books

| Method | Endpoint | Description |
|-------|----------|-------------|
| GET | /api/books | List all available books |
| GET | /api/books/:id | Book details |


### Enrollments

| Method | Endpoint | Description |
|-------|----------|-------------|
| POST | /api/enrollments | Enroll user in a course |
| GET | /api/enrollments/my | Get user's enrolled courses |
| DELETE | /api/enrollments/:courseId | Cancel enrollment |


### Shopping Cart

| Method | Endpoint | Description |
|-------|----------|-------------|
| GET | /api/cart | Retrieve cart items |
| POST | /api/cart | Add course or book to cart |
| DELETE | /api/cart/:itemId | Remove item from cart |
| POST | /api/checkout | Complete purchase & create enrollments |


### Reviews

| Method | Endpoint | Description |
|-------|----------|-------------|
| POST | /api/reviews/courses/:id | Create course review |
| POST | /api/reviews/books/:id | Create book review |
| GET | /api/reviews/courses/:id | Get reviews & rating statistics |


## Implementation Notes (Features)

- **Security**  
  Authentication is handled with **Firebase Auth** and protected routes use Firebase ID tokens.

- **Authorization**  
  Access to protected routes is secured using Firebase Admin token verification via middleware.

- **Validation**  
  Centralized validation for:
  - Email format
  - Password complexity
  - Minimum age requirement (16 years)

- **User Experience**  
  Supports **auto-login** immediately after successful registration.

- **Database**  
  Uses **Firestore** queries for catalog, cart, enrollments, purchases, and review statistics.

