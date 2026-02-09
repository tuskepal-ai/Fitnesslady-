async function loadReviews() {
  const container = document.getElementById('reviews-container');
  container.textContent = 'Loading reviews...';
  try {
    const response = await fetch('/api/reviews');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const reviews = await response.json();
    container.textContent = '';
    if (reviews.length === 0) {
      container.textContent = 'No reviews available at the moment.';
      return;
    }

    reviews.forEach(review => {
      const reviewDiv = document.createElement('div');
      reviewDiv.className = 'review';

      const author = document.createElement('h3');
      author.textContent = review.author || 'Anonymous';
      reviewDiv.appendChild(author);

      const body = document.createElement('p');
      body.textContent = review.body || '';
      reviewDiv.appendChild(body);

      if (review.rating !== undefined && review.rating !== null) {
        const rating = document.createElement('p');
        rating.textContent = 'Rating: ' + review.rating;
        reviewDiv.appendChild(rating);
      }

      container.appendChild(reviewDiv);
    });

  } catch (error) {
    container.textContent = 'Failed to load reviews. Please try again later.';
    console.error('Error loading reviews:', error);
  }
}

window.addEventListener('DOMContentLoaded', loadReviews);
