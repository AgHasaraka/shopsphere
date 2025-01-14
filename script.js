const searchButton = document.querySelector('.search-bar button');
const searchInput = document.querySelector('.search-bar input');

searchButton.addEventListener('click', function() {
    performSearch(searchInput.value);
});

function performSearch(query) {
    console.log('Searching for:', query);
    // You would perform an actual search here
}

<script>
    let lastScrollY = window.scrollY;
    const header = document.querySelector('.header');

    window.addEventListener('scroll', () => {
        if (window.scrollY > lastScrollY) {
            // Scrolling down
            header.classList.add('hidden');
        } else {
            // Scrolling up
            header.classList.remove('hidden');
        }
        lastScrollY = window.scrollY;
    });
</script>
