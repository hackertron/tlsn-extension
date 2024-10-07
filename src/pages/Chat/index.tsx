import React, { useState, useEffect, useRef } from 'react';
import './Chat.css';
import { useRequests } from '../../reducers/requests';  // Import the requests hook

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'bot';
}

const Chat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>(() => {
        const savedMessages = localStorage.getItem('chatMessages');
        return savedMessages ? JSON.parse(savedMessages) : [];
    });
    const [inputMessage, setInputMessage] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const [chatId, setChatId] = useState<string | null>(null);
    const requests = useRequests(); // Fetch all requests

    useEffect(() => {
        localStorage.setItem('chatMessages', JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        const initializeChat = async () => {
            const storedChatId = localStorage.getItem('chatId');
            if (storedChatId) {
                setChatId(storedChatId);
                await connectWebSocket(storedChatId);
            } else {
                await fetchNewChatId();
            }
        };

        initializeChat();

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    const fetchNewChatId = async () => {
        try {
            const response = await fetch('http://localhost:8000/get_chat_id');
            const data = await response.json();
            const newChatId = data.chat_id;
            localStorage.setItem('chatId', newChatId);
            setChatId(newChatId);
            await connectWebSocket(newChatId);
        } catch (error) {
            console.error('Failed to fetch chat ID:', error);
        }
    };

    const connectWebSocket = async (id: string) => {
        return new Promise<void>((resolve, reject) => {
            socketRef.current = new WebSocket(`ws://localhost:8000/ws/${id}`);

            socketRef.current.onopen = () => {
                console.log('WebSocket connection established');
                setIsConnected(true);
                resolve();
            };

            socketRef.current.onmessage = (event) => {
                const botResponse: Message = {
                    id: Date.now(),
                    text: event.data,
                    sender: 'bot',
                };
                setMessages((prevMessages) => [...prevMessages, botResponse]);
                console.log('Bot response:', botResponse.text);

                // Detect if server response contains "Sample Requests and Responses"
                if (botResponse.text.includes("Sample Requests and Responses")) {
                    // Populate the input with request data
                    const requestDetails = requests.map(req => `${req.method} ${req.url}`).join('\n');
                    setInputMessage(requestDetails);
                }
            };

            socketRef.current.onclose = () => {
                console.log('WebSocket connection closed');
                setIsConnected(false);
            };

            socketRef.current.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };
        });
    };

    const sendMessage = () => {
        if (inputMessage.trim() === '' || !isConnected) return;

        const newMessage: Message = {
            id: Date.now(),
            text: inputMessage,
            sender: 'user',
        };
        setMessages((prevMessages) => [...prevMessages, newMessage]);
        setInputMessage('');
        console.log('User message:', newMessage.text);

        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(inputMessage);
        } else {
            console.error('WebSocket is not connected');
        }
    };

    const clearChat = () => {
        setMessages([]);
    };

    return (
        <div className="chat-container">
            <div className="chat-window">
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`message ${message.sender === 'user' ? 'user' : 'bot'}`}
                    >
                        {message.text}
                    </div>
                ))}
            </div>
            <div className="chat-input">
                <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Type your message..."
                    className="chat-input-field"
                />
                <div className="chat-buttons">
                    <button onClick={sendMessage} className="send-button" disabled={!isConnected}>Send</button>
                    <button onClick={clearChat} className="clear-button" style={{ backgroundColor: '#f44336', color: 'white', border: 'none' }}>Clear Chat</button>
                </div>
            </div>
            {!isConnected && <div className="connection-status">Disconnected</div>}
        </div>
    );
};

export default Chat;
