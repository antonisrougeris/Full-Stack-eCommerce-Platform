# DevDromos - Educational Platform (Frontend - Part B)

This is the frontend implementation of the DevDromos platform, an online space for learning programming and purchasing technology books.

## Team Members
* ANTONIS KOURIS - 3220089
* ANTONIS ROUNGERIS - 3220172
  
## Tech Stack
The application follows a Client-Server architecture utilizing:
* **HTML5 & CSS3**: Structure and responsive (mobile-first) design.
* **TypeScript**: Main programming logic.
* **Vite**: For building and bundling.
* **REST API & Firebase Auth**: Backend communication and user authentication.
* **Backend Data Layer:** **Firebase Auth + Firestore** for storing users, courses, books, and cart data.

## Folder Structure
* `/pages`: Contains HTML files and page-specific TypeScript logic (Courses, Books, Login, etc.).
* `/services`: Handles API communication (fetch) and Authentication (Firebase tokens): 
  api.ts: Centralized fetch requests handling.
  auth.ts: LocalStorage management for Firebase ID tokens.
  authGuard.ts: Route protection for authenticated users.
* `/components`: Reusable UI elements (Navigation, Cards, Modals).
* `/utils`: Helper scripts for form validation and cart updates.
* `/assets`: Static assets (CSS, Images, Logos).

## Features
1. **Authentication**: User Registration and Login with Token management.
2. **Dynamic Catalog**: Fetching and displaying courses and books from the server.
3. **Filtering**: Real-time search and category filtering using URL parameters.
4. **Shopping Cart**: Add/Remove items and complete purchases (Checkout).
5. **Video Player**: Dynamic modal integration for playing introductory videos.

## Setup Instructions
1. Ensure the backend server is running at `http://localhost:4000` and configured for Firebase.
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`