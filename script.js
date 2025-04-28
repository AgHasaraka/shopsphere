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
    .then(response => response.json())
    .then(data => {
        products = data; // Store product data in a global variable
        displayProducts(products); // Display all products initially
    })
    .catch(error => console.error('Error loading products:', error));

// Function to display products
function displayProducts(productList) {
    const productContainer = document.getElementById('product-listings');
    productContainer.innerHTML = ''; // Clear previous results

    productList.forEach(product => {
        const productCard = document.createElement('div');
        productCard.classList.add('product');

        productCard.innerHTML = `
            <a href="${product.link}" target="_blank">
                <img src="${product.image}" alt="${product.name}">
            </a>
            <div class="product-info">
                <h3>${product.name}</h3>
                <p class="price">${product.price}</p>
                <p class="shipping">${product.shipping}</p>
            </div>
        `;

        productContainer.appendChild(productCard);
    });
}

// Search Suggestions Logic
const searchInput = document.getElementById('searchInput');
const searchSuggestions = document.getElementById('searchSuggestions');

searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    searchSuggestions.innerHTML = '';

    if (query) {
        const filteredProducts = products.filter(product =>
            product.name.toLowerCase().includes(query)
        );

        if (filteredProducts.length > 0) {
            filteredProducts.forEach(product => {
                const suggestionDiv = document.createElement('div');
                suggestionDiv.textContent = product.name;
                suggestionDiv.classList.add('suggestion');
                suggestionDiv.addEventListener('click', () => {
                    searchInput.value = product.name;
                    searchSuggestions.innerHTML = '';
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

// Hide suggestions when clicking outside the input
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
        searchSuggestions.style.display = 'none';
    }
});

// Countdown Timer
function startCountdown(endTime) {
    const now = new Date().getTime();
    const timeRemaining = endTime - now;

    if (timeRemaining > 0) {
        const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

        document.getElementById('countdown').textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        setTimeout(() => startCountdown(endTime), 1000);
    } else {
        document.getElementById('countdown').textContent = 'Expired!';
    }
}

// Set the end time for today's deals (e.g., 24 hours from now)
const endTime = new Date().getTime() + 24 * 60 * 60 * 1000;
startCountdown(endTime);

// Dynamic Copyright Year
document.getElementById('currentYear').textContent = new Date().getFullYear();