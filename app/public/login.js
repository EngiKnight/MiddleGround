document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const messageDiv = document.getElementById('message');
    const formData = new FormData(this);
    const submitButton = this.querySelector('button[type="submit"]');
    
    clearMessages(messageDiv);
    
    submitButton.disabled = true;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: formData.get('email'),
                pwd: formData.get('pwd')
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayMessage(messageDiv, `Welcome back, ${data.user.firstName}!`, 'success');
            
            sessionStorage.setItem('user', JSON.stringify(data.user));
            
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            displayMessage(messageDiv, data.error, 'error');
        }
    } catch (error) {
        displayMessage(messageDiv, 'Network error. Please try again.', 'error');
        console.error('Error:', error);
    } finally {
        // Re-enable submit button
        submitButton.disabled = false;
        submitButton.textContent = 'Login';
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
