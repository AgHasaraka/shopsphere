document.addEventListener('DOMContentLoaded', () => {

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
            header.classList.add('hidden');
        } else {
            header.classList.remove('hidden');
        }
        lastScrollY = window.scrollY;
    });

    // Fetch product data from JSON
    let products = [];
    fetch('products.json')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            products = data;
            displayProducts(products);
        })
        .catch(error => {
            console.error('Error loading products:', error);
            const productContainer = document.getElementById('product-listings');
            productContainer.innerHTML = `<p class="error-message">Oops! We couldn't load products. Please try again later.</p>`;
        });

    // --- NEW: Helper function to render star ratings ---
    function renderStars(rating) {
        let starsHTML = '';
        const fullStars = Math.floor(rating);
        const halfStar = rating % 1 >= 0.5 ? 1 : 0;
        const emptyStars = 5 - fullStars - halfStar;
        for (let i = 0; i < fullStars; i++) starsHTML += '<i class="fas fa-star"></i>';
        if (halfStar) starsHTML += '<i class="fas fa-star-half-alt"></i>';
        for (let i = 0; i < emptyStars; i++) starsHTML += '<i class="far fa-star"></i>';
        return starsHTML;
    }

    // --- REWRITTEN: Function to display products with the new look ---
    function displayProducts(productList) {
        const productContainer = document.getElementById('product-listings');
        productContainer.innerHTML = '';
        if (productList.length === 0) {
            productContainer.innerHTML = '<p class="error-message">No products match your search.</p>';
            return;
        }

        productList.forEach(product => {
            const productCard = document.createElement('div');
            productCard.classList.add('product-card');

            const tagsHTML = product.tags.map(tag => `<span class="product-tag">${tag}</span>`).join('');

            productCard.innerHTML = `
                <a href="${product.link}" target="_blank" class="product-link">
                    <div class="product-image-container">
                        <img src="${product.image}" alt="${product.name}" class="product-image">
                        <div class="product-tags">${tagsHTML}</div>
                    </div>
                    <div class="product-info">
                        <h3 class="product-title">${product.name}</h3>
                        <div class="product-pricing">
                            <span class="product-price">${product.price}</span>
                            <span class="product-original-price">${product.original_price}</span>
                        </div>
                        <div class="product-meta">
                            <div class="product-rating">${renderStars(product.rating)}</div>
                            <span class="product-sales">${product.sales}</span>
                        </div>
                        <p class="product-shipping">${product.shipping}</p>
                    </div>
                </a>
            `;
            productContainer.appendChild(productCard);
        });
    }

    // Search Logic
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.querySelector('.search-button');

    function performSearch() {
        const query = searchInput.value.trim().toLowerCase();
        const filteredProducts = products.filter(product => product.name.toLowerCase().includes(query));
        displayProducts(filteredProducts);
    }

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') performSearch();
        if (searchInput.value.trim() === '') displayProducts(products); // Show all if search is cleared
    });
    
    // Countdown Timer
    const endTime = new Date('July 31, 2025 23:59:59').getTime();
    const countdownElement = document.getElementById('countdown');
    const timerInterval = setInterval(() => {
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
    }, 1000);

    // Dynamic Copyright Year
    document.getElementById('currentYear').textContent = new Date().getFullYear();
});
