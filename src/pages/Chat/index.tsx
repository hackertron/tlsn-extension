import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Chat.css';
import { useRequests } from '../../reducers/requests';
import { extractBodyFromResponse } from '../../utils/misc';
import { extractJsonFromMessage } from './extractjson';

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'bot';
}

interface CapturedData {
    request: string;
    headers: Record<string, string>;
    response: string;
}

interface RequestData {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
}

const Chat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>(() => {
        const savedMessages = localStorage.getItem('chatMessages');
        return savedMessages ? JSON.parse(savedMessages) : [];
    });
    const [inputMessage, setInputMessage] = useState('');
    const [allRequests, setAllRequests] = useState<RequestData[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef<WebSocket | null>(null);
    const [chatId, setChatId] = useState<string | null>(null);
    const requests = useRequests();
    const [capturedData, setCapturedData] = useState<CapturedData[]>([]);

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

    const captureRequestAndResponse = useCallback(async (req: RequestData) => {
        try {
            const response = await fetch(req.url, {
                method: req.method,
                headers: req.headers,
                body: req.body,
            });
            const responseText = await extractBodyFromResponse(response);
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headers[key] = value;
            });
            setCapturedData(prevData => [...prevData, {
                request: `${req.method} ${req.url}`,
                headers,
                response: responseText,
            }]);
        } catch (error) {
            console.error('Error capturing request and response:', error);
        }
    }, []);

    const fetchMultipleRequests = async (requests: RequestData[]) => {
        try {
            const fetchPromises = requests.map(async (req) => {
                const response = await fetch(req.url, {
                    method: req.method,
                    headers: req.headers,
                });
                const responseText = await response.text();
                return {
                    request: `${req.method} ${req.url}`,
                    headers: req.headers,
                    response: responseText,
                };
            });

            const responses = await Promise.all(fetchPromises);

            // Store all responses and send them to the server
            setCapturedData(prevData => [...prevData, ...responses]);
        } catch (error) {
            console.error('Error fetching multiple requests:', error);
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

                if (botResponse.text.includes("send_request_function")) {
                    const requestDetails = requests.map(req => `${req.method} ${req.url}`).join('\n');
                    setAllRequests(requests.map(req => ({
                        method: req.method,
                        url: req.url,
                        headers: req.requestHeaders.reduce((acc: { [key: string]: string }, h: any) => {
                            if (h.name && h.value) acc[h.name] = h.value;
                            return acc;
                        }, {}),
                    })));

                    console.log("All requests:", allRequests);
                    setInputMessage(requestDetails);
                }

                if (botResponse.text.includes("send_response_function")) {
                    const regex = /send_response_function\s*:\s*(\[.*?\])/s;
                    const match = botResponse.text.match(regex);
                    if (!match) {
                        console.error("No JSON-like content found in the message");
                        return;
                    }
                    const requestArrayString = match[1];
                    console.log("JSON-like string:", requestArrayString);
                    try {

                        const requestArray: RequestData[] = JSON.parse(requestArrayString);
                        // Handle multiple filtered requests
                        fetchMultipleRequests(requestArray);
                    } catch (error) {
                        console.error("Error parsing JSON:", error);
                    }
                    const response_message = capturedData.map(data => data.response).join('\n');
                    setInputMessage(response_message);
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

    useEffect(() => {
        // Send captured data to the server after fetching
        if (capturedData.length > 0 && isConnected) {
            const capturedDataMessage = JSON.stringify(capturedData);
            socketRef.current?.send(capturedDataMessage);
            setCapturedData([]); // Clear captured data after sending
        }
    }, [capturedData, isConnected]);

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
        setAllRequests([]);
        setCapturedData([]);

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
