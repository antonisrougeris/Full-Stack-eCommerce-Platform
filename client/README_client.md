# DevDromos - Εκπαιδευτική Πλατφόρμα (Frontend - Μέρος Β)

Αυτό είναι το frontend κομμάτι της εφαρμογής DevDromos, μιας πλατφόρμας εκμάθησης προγραμματισμού και αγοράς βιβλίων τεχνολογίας.

## Ομάδα Εργασίας
* ANTONIS KOURIS - 3220089
* ANTONIS ROUNGERIS - 3220172
  
## Τεχνολογίες & Εργαλεία
Η εφαρμογή βασίζεται στην αρχιτεκτονική Client-Server με χρήση των παρακάτω:
* **HTML5 & CSS3**: Responsive σχεδιασμός (Mobile-first) με χρήση Flexbox/Grid.
* **TypeScript**: Για την ανάπτυξη της λογικής.
* **Vite**: Εργαλείο ανάπτυξης και bundling.
* **REST API & Firebase Auth**: Επικοινωνία με τον server και ταυτοποίηση χρηστών.
* **Backend Data Layer:** **Firebase Auth + Firestore** για την αποθήκευση χρηστών, προϊόντων και παραγγελιών.

## Δομή

```text
client/
├── index.html              # Αρχική σελίδα
├── vite.config.js          # Ρυθμίσεις Vite & API proxy
├── public/assets/          # Στατικά CSS & εικόνες
└── src/
    ├── main.ts             # Γενική αρχικοποίηση
    ├── components/         # UI components
    ├── pages/              # Modules ανά σελίδα
    ├── services/           # API & πιστοποίηση
    ├── utils/              # Βοηθητικές συναρτήσεις
    └──scripts/             # Βοηθητικές συναρτήσεις βίντεο
```

## Λειτουργίες που Υλοποιήθηκαν

### Πιστοποίηση (Authentication)
- Εγγραφή χρήστη με επικύρωση
- Σύνδεση (Login)
- Προστατευμένες σελίδες (καλάθι, checkout)


### Κατάλογος Μαθημάτων & Βιβλίων
- Περιήγηση μαθημάτων και βιβλίων
- Αναζήτηση και φιλτράρισμα κατηγοριών
- Σελίδα λεπτομερειών μαθήματος
- Responsive card layouts

### Καλάθι Αγορών
- Προσθήκη μαθημάτων/βιβλίων στο καλάθι
- Αποθήκευση καλαθιού στον server
- Ένδειξη αριθμού προϊόντων στο καλάθι
- Αφαίρεση προϊόντων από το καλάθι
- Διαδικασία ολοκλήρωσης αγοράς

### Πρόσθετα
- Mobile first σχεδιασμός
- Τμήμα βίντεο στη σελίδα about


## Εγκατάσταση & Ρύθμιση

### Προαπαιτούμενα
- Node.js (v18+) 
- Firebase project + Firestore σε λειτουργία μέσω του backend server
- Backend server σε λειτουργία στο `http://localhost:4000`

### Εγκατάσταση dependencies

```bash
cd .../client
npm install 
```

## Εκτέλεση 

### Εκκίνηση Development Server

```bash
npm run dev
```

ανοίγω το **http://localhost:5173** στο browser