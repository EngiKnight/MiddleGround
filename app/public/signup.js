document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const messageDiv = document.getElementById('message');
    const formData = new FormData(this);
    const submitButton = this.querySelector('button[type="submit"]');
    
    clearMessages(messageDiv);
    
    submitButton.disabled = true;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fname: formData.get('fname'),
                lname: formData.get('lname'),
                email: formData.get('email'),
                pwd: formData.get('pwd')
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayMessage(messageDiv, data.message, 'success');
            this.reset();
            
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            displayMessage(messageDiv, data.error, 'error');
        }
    } catch (error) {
        displayMessage(messageDiv, 'Network error. Please try again.', 'error');
        console.error('Error:', error);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Sign Up';
    }
});

function displayMessage(container, message, type) {
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.setAttribute('data-message-type', type);
    container.appendChild(messageElement);
}

function clearMessages(container) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
}
