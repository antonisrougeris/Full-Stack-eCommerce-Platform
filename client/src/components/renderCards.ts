

/**
 * Creates and returns a Course Card element.
 * Uses the course-card CSS classes from components.css
 *
 * @param {Object} course - Course data object
 * @returns {HTMLElement} article.course-card
 */
export function renderCourseCard(course: any): HTMLElement {
  // Create main card container
  const article = document.createElement("article");
  article.classList.add("card", "course-card");

  // Optional: background image support
  if (course.image) {
    article.style.backgroundImage = `url("${course.image}")`;
    article.classList.add("course-card--bg");
  }

  // Badge showing level (Beginner/Intermediate/etc.)
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = course.level;

  // Course Title
  const title = document.createElement("h2");
  title.textContent = course.title;

  // Short description
  const description = document.createElement("p");
  description.textContent = course.shortDescription;

  // Meta info
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${course.durationWeeks} weeks • ${course.students} students • ★ ${course.rating}`;

  // Price line
  const price = document.createElement("p");
  price.className = "price";
  price.textContent = `$${course.priceUSD}`;

  // Link to course details page
  const link = document.createElement("a");
  link.className = "btn-outline";
  const courseId = (course.id || course._id || "").toString();

  // Build a URL relative to this module so it works under sub-path deployments
  // and when opened via file:// (avoids hard-coded leading '/').
  const detailsUrl = new URL("../pages/courses-details/courses-details.html", import.meta.url);
  detailsUrl.searchParams.set("id", courseId);
  link.href = detailsUrl.toString();
  link.textContent = "View details";

  // Append all elements
  article.append(badge, title, description, meta, price, link);

  return article;
}

/**
 * Clears a container and renders a list of course cards
 * @param {HTMLElement} container
 * @param {Array} courseList
 */
export function renderCourses(container: HTMLElement, courseList: any[]): void {
  if (!container) return;

  // Clear previous cards
  container.innerHTML = "";

  // Render each course card
  courseList.forEach((course) => {
    container.appendChild(renderCourseCard(course));
  });
}

/**
 * Creates and returns a Book Card element
 * Includes an "Add to cart" button that writes to localStorage via cart.js
 * @param {Object} book
 * @returns {HTMLElement} article.book-card
 */
export function renderBookCard(book: any, ownedBookIds?: Set<string>): HTMLElement {
  // Create main card container
  const article = document.createElement("article");
  article.classList.add("card", "book-card");

  // Used by pages to apply additional logic if needed
  const bookId = (book._id || book.id || "").toString();
  article.dataset.bookId = bookId;

  // Badge showing book category
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = book.category;

  // Book title
  const title = document.createElement("h2");
  title.textContent = book.title;

  // Author + rating line
  const author = document.createElement("p");
  author.className = "meta";
  author.textContent = `By ${book.author} • ★ ${book.rating}`;

  // Short description
  const description = document.createElement("p");
  description.textContent = book.shortDescription;

  // Price line
  const price = document.createElement("p");
  price.className = "price";
  price.textContent = `$${book.priceUSD}`;

  // Add static elements first
  article.append(badge, title, author, description, price);

  // Add-to-cart button
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn-outline";
  addBtn.textContent = "Add to cart";

  // If user already owns this book, lock the button.
  if (ownedBookIds?.has(bookId)) {
    addBtn.disabled = true;
    addBtn.textContent = "Owned";
  }

  // On click: add item to cart via API & update the cart badge
  addBtn.addEventListener("click", async () => {
    // Match the course-details behavior: require login
    try {
      // If owned, do nothing (extra safety)
      if (addBtn.disabled && addBtn.textContent === "Owned") return;
      
      // Import API function dynamically to avoid circular dependencies
      const { isLoggedIn, waitForAuthReady } = await import("../services/auth");
      const { updateCartBadge } = await import("../utils/cart-badge");

      // Check if user is logged in after Firebase restores its auth state
      await waitForAuthReady();
      if (!isLoggedIn()) {
        alert("Please login to add items to cart");
        window.location.href = new URL("../pages/login/login.html", import.meta.url).toString();
        return;
      }

      // Disable button to prevent double-clicks
      addBtn.disabled = true;
      addBtn.textContent = "Adding...";
      
      // Add to cart via server API

      
      // Update the cart badge in navigation
      await updateCartBadge();
      
      // Visual feedback + redirect (same as course-details)
      addBtn.textContent = "Added to cart!";
      addBtn.classList.remove("btn-primary");
      addBtn.classList.add("btn-outline");

      // Stay on the current page (books). Reset button after a short delay.
      setTimeout(() => {
        addBtn.disabled = false;
        addBtn.textContent = "Add to cart";
      }, 1200);
    } catch (error) {
      console.error("Failed to add book to cart:", error);
      addBtn.textContent = "Error!";
      //pop a toast or alert
      alert("Already in cart");
      addBtn.disabled = false;
      setTimeout(() => {
        addBtn.textContent = "Add to cart";
      }, 1500);
    }
  });

  // Append button to card
  article.append(addBtn);

  return article;
}

/**
 * Utility: clears a container and renders a list of book cards
 * @param {HTMLElement} container
 * @param {Array} bookList
 */
export function renderBooks(container: HTMLElement, bookList: any[], ownedBookIds?: Set<string>): void {
  if (!container) return;

  // Clear previous cards
  container.innerHTML = "";
  // Render each book card
  bookList.forEach((book) => container.appendChild(renderBookCard(book, ownedBookIds)));
}
