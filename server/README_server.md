# Devdromos Server (Part B) 

## Ομάδα Εργασίας
* ANTONIS KOURIS - 3220089
* ANTONIS ROUNGERIS - 3220172
  
Node.js (v18+) + Express + Firebase backend API για την εφαρμογή **Devdromos**.
Το API διαχειρίζεται:

- Αυθεντικοποίηση χρηστών
- Κατάλογο μαθημάτων και βιβλίων
- Εγγραφές χρηστών
- Καλάθι αγορών & checkout
- Αξιολογήσεις (reviews)

## Δομή Φακέλων

Η αρχιτεκτονική του κώδικα ακολουθεί το πρότυπο **Controller – Route – Config** για μέγιστη επεκτασιμότητα.

```text
partb/
└── server/
    ├── src/
    │   ├── controllers/   # Λογική χειρισμού αιτημάτων
    │   ├── routes/        # Ορισμός API endpoints
    │   ├── middleware/    # Firebase Auth, Validation & Error Handling
    │   ├── config/        # Σύνδεση με Firebase Admin / Firestore
    │   └── app.js         # Κεντρικό αρχείο εφαρμογής
    ├── .env               # Μεταβλητές περιβάλλοντος
    ├── package.json       # Εξαρτήσεις & scripts
    └── server.js          # Εκκίνηση server
```

## Ρύθμιση & Εγκατάσταση

### 1. Δημιουργία αρχείου `.env`

Στον φάκελο `server/` δημιουργήστε αρχείο `.env` με τις παρακάτω ρυθμίσεις:

```env
PORT=4000
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_WEB_API_KEY=your_firebase_web_api_key
CORS_ORIGIN=http://localhost:5173
```

### 2. Εγκατάσταση Εξαρτήσεων

```bash
npm install
```

### 3. Εκκίνηση Server

```bash
npm run dev
```

Ο server θα τρέχει στο:
**http://localhost:4000**


## API Endpoints

### Αυθεντικοποίηση (Auth)

| Μέθοδος | Endpoint | Περιγραφή |
|--------|----------|-----------|
| POST | /api/auth/register | Εγγραφή νέου χρήστη & αυτόματο login |
| POST | /api/auth/login | Ταυτοποίηση & επιστροφή Firebase ID token |


### Χρήστες (Users)

| Μέθοδος | Endpoint | Περιγραφή |
|--------|----------|-----------|
| GET | /api/users/me | Προφίλ συνδεδεμένου χρήστη (Protected) |


### Μαθήματα (Courses)

| Μέθοδος | Endpoint | Περιγραφή |
|--------|----------|-----------|
| GET | /api/courses | Λίστα μαθημάτων (filters & search) |
| GET | /api/courses/:id | Λεπτομέρειες μαθήματος |


### Βιβλία (Books)

| Μέθοδος | Endpoint | Περιγραφή |
|--------|----------|-----------|
| GET | /api/books | Λίστα διαθέσιμων βιβλίων |
| GET | /api/books/:id | Λεπτομέρειες βιβλίου |


### Εγγραφές (Enrollments)

| Μέθοδος | Endpoint | Περιγραφή |
|--------|----------|-----------|
| POST | /api/enrollments | Εγγραφή χρήστη σε μάθημα |
| GET | /api/enrollments/my | Μαθήματα που παρακολουθεί ο χρήστης |
| DELETE | /api/enrollments/:courseId | Ακύρωση εγγραφής |


### Καλάθι Αγορών (Cart)

| Μέθοδος | Endpoint | Περιγραφή |
|--------|----------|-----------|
| GET | /api/cart | Ανάκτηση αντικειμένων καλαθιού |
| POST | /api/cart | Προσθήκη μαθήματος ή βιβλίου |
| DELETE | /api/cart/:itemId | Αφαίρεση αντικειμένου |
| POST | /api/checkout | Ολοκλήρωση αγοράς & δημιουργία enrollments |


### Αξιολογήσεις (Reviews)

| Μέθοδος | Endpoint | Περιγραφή |
|--------|----------|-----------|
| POST | /api/reviews/courses/:id | Νέα αξιολόγηση μαθήματος |
| POST | /api/reviews/books/:id | Νέα αξιολόγηση βιβλίου |
| GET | /api/reviews/courses/:id | Λίστα αξιολογήσεων & στατιστικά |


## Σημειώσεις Υλοποίησης (Features)

- **Security**: Firebase Auth για login/register και έλεγχο πρόσβασης
- **Authorization**: Firebase ID token middleware για protected routes
- **Validation**: Email, password complexity, ηλικία ≥ 16
- **User Experience**: Auto-login μετά την εγγραφή
- **Database**: Firestore queries για κατάλογο, καλάθι, εγγραφές και αξιολογήσεις

