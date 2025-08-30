require('dotenv').config();
const axios = require('axios');

const ngrokUrl = 'https://02a055eb4a11.ngrok-free.app'; // Your Ngrok URL

const paymentoApiKey = process.env.PAYMENTO_API_KEY;
const paymentoApiSecret = process.env.PAYMENTO_API_SECRET;

const paymentSettingsUrl = 'https://api.paymento.io/v1/payment/settings';

async function setWebhookUrl() {
    try {
        // Changed from axios.put to axios.post
        const response = await axios.post(paymentSettingsUrl, {
            ipn_url: `${ngrokUrl}/api/deposit-webhook`
        }, {
            headers: {
                'X-API-KEY': paymentoApiKey,
                'X-API-SECRET': paymentoApiSecret,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 200) {
            console.log('✅ Webhook URL set successfully!');
            console.log('Response:', response.data);
        } else {
            console.error('❌ Failed to set webhook URL. Status:', response.status);
        }
    } catch (error) {
        console.error('❌ Error calling PayMento API:', error.response ? `Status Code: ${error.response.status}; ${error.response.statusText}` : error.message);
    }
}

setWebhookUrl();