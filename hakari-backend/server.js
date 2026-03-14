const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log(err));
// Conversation memory schema
const memorySchema = new mongoose.Schema({
    user: String,
    question: String,
    answer: String,
    timestamp: Date
});
const Memory = mongoose.model('Memory', memorySchema);

// AI endpoint
app.post('/ask', async (req, res) => {
    const { question, user } = req.body;

    try {
        const aiResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-5-mini',
                messages: [{ role: 'user', content: question }]
            },
            { headers: { 'Authorization': `Bearer ${process.env.OPENAI_KEY}` } }
        );

        const answer = aiResponse.data.choices[0].message.content;

        // Save conversation to DB
        await Memory.create({ user, question, answer, timestamp: new Date() });

        res.json({ answer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "AI call failed" });
    }
});

app.listen(5000, () => console.log("Server running on port 5000"));