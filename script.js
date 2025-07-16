// Initialize Swiper Carousel
const swiper = new Swiper('.swiper-container', {
    loop: true,
    autoplay: {
        delay: 3000,
        disableOnInteraction: false,
    },
    pagination: {
        el: '.swiper-pagination',
        clickable: true,
    },
    navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
    },
});

// Sticky Header Behavior
let lastScrollY = window.scrollY;
const header = document.querySelector('.header');

window.addEventListener('scroll', () => {
    if (window.scrollY > lastScrollY && window.scrollY > 100) {
        // Scrolling down
        header.classList.add('hidden');
    } else {
        // Scrolling up
        header.classList.remove('hidden');
    }
    lastScrollY = window.scrollY;
});

// Fetch product data from JSON
let products = [];
fetch('products.json')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        products = data; // Store product data
        displayProducts(products); // Display all products initially
    })
    .catch(error => {
        console.error('Error loading products:', error);
        const productContainer = document.getElementById('product-listings');
        // Display a user-friendly error message on the page
        productContainer.style.textAlign = 'center';
        productContainer.innerHTML = `
            <p style="color: var(--dark-gray); font-size: 18px; padding: 40px;">
                Oops! We had trouble loading the products.
                <br>
                Please check your internet connection and try again later.
            </p>`;
    });

// Function to display products
function displayProducts(productList) {
    const productContainer = document.getElementById('product-listings');
    productContainer.innerHTML = ''; // Clear previous results

    if (productList.length === 0) {
        productContainer.innerHTML = '<p>No products found.</p>';
        return;
    }

    productList.forEach(product => {
        const productCard = document.createElement('div');
        productCard.classList.add('product');

        productCard.innerHTML = `
            <a href="${product.link}" target="_blank" title="View product on AliExpress">
                <img src="${product.image}" alt="${product.name}">
            </a>
            <div class="product-info">
                <h3>${product.name}</h3>
                <div>
                    <p class="price">${product.price}</p>
                    <p class="shipping">${product.shipping}</p>
                </div>
            </div>
        `;

        productContainer.appendChild(productCard);
    });
}

// Search Logic
const searchInput = document.getElementById('searchInput');
const searchSuggestions = document.getElementById('searchSuggestions');
const searchButton = document.querySelector('.search-button');

function performSearch() {
    const query = searchInput.value.trim().toLowerCase();
    const filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(query)
    );
    displayProducts(filteredProducts);
    searchSuggestions.style.display = 'none';
}

searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    searchSuggestions.innerHTML = '';

    if (query) {
        const filteredProducts = products.filter(product =>
            product.name.toLowerCase().includes(query)
        );

        if (filteredProducts.length > 0) {
            filteredProducts.slice(0, 10).forEach(product => { // Limit suggestions
                const suggestionDiv = document.createElement('div');
                suggestionDiv.textContent = product.name;
                suggestionDiv.classList.add('suggestion');
                suggestionDiv.addEventListener('click', () => {
                    searchInput.value = product.name;
                    searchSuggestions.style.display = 'none';
                    displayProducts([product]); // Display only the selected product
                });
                searchSuggestions.appendChild(suggestionDiv);
            });
        } else {
            const noResultsDiv = document.createElement('div');
            noResultsDiv.textContent = 'No results found';
            noResultsDiv.classList.add('no-results');
            searchSuggestions.appendChild(noResultsDiv);
        }

        searchSuggestions.style.display = 'block';
    } else {
        searchSuggestions.style.display = 'none';
        displayProducts(products); // Show all products if the search bar is empty
    }
});

searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keyup', (event) => {
    if (event.key === 'Enter') {
        performSearch();
    }
});

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
        searchSuggestions.style.display = 'none';
    }
});

// Countdown Timer
function startCountdown(endTime) {
    const countdownElement = document.getElementById('countdown');

    function updateTimer() {
        const now = new Date().getTime();
        const timeRemaining = endTime - now;

        if (timeRemaining > 0) {
            const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

            countdownElement.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        } else {
            countdownElement.textContent = 'Deals Expired!';
            clearInterval(timerInterval);
        }
    }

    const timerInterval = setInterval(updateTimer, 1000);
    updateTimer(); // Initial call
}

// **FIXED**: Set the end time to a specific future date
const endTime = new Date('July 31, 2025 23:59:59').getTime();
startCountdown(endTime);

// Dynamic Copyright Year
document.getElementById('currentYear').textContent = new Date().getFullYear();
