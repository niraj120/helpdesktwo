import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_CONFIG } from '../config/constants';
import DOMPurify from 'dompurify';

interface KBArticle {
  _id: string;
  title: string;
  content: string;
  tags?: string[];
  viewCount: number;
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  articles?: KBArticle[];
  timestamp: Date;
}

const KBChatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! I\'m CET Mitra, your virtual assistant. I can help you find solutions to your queries. How may I assist you today?',
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  console.log('KBChatbot rendered, isOpen:', isOpen);

  useEffect(() => {
    // Load KB articles when chatbot opens
    if (isOpen && kbArticles.length === 0) {
      loadKBArticles();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadKBArticles = async () => {
    try {
      const projectContext = localStorage.getItem('projectContext');
      if (!projectContext) return;
      
      const { projectId } = JSON.parse(projectContext);
      const response = await axios.get(`${API_CONFIG.API_URL}/kb/project/${projectId}`);
      
      if (response.data.success) {
        const publishedArticles = response.data.data.filter((article: KBArticle) => 
          article.content && article.content.trim() !== ''
        );
        setKbArticles(publishedArticles);
      }
    } catch (error) {
      console.error('Error loading KB articles:', error);
    }
  };

  const searchArticles = (query: string): KBArticle[] => {
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
    
    if (searchTerms.length === 0) {
      return [];
    }

    const scoredArticles = kbArticles.map(article => {
      let score = 0;
      const titleLower = article.title.toLowerCase();
      const contentLower = article.content.toLowerCase();
      const tagsLower = article.tags?.join(' ').toLowerCase() || '';

      searchTerms.forEach(term => {
        // Title matches are worth more
        if (titleLower.includes(term)) {
          score += 10;
        }
        // Content matches
        const contentMatches = (contentLower.match(new RegExp(term, 'g')) || []).length;
        score += contentMatches * 2;
        
        // Tag matches
        if (tagsLower.includes(term)) {
          score += 5;
        }
      });

      return { article, score };
    });

    // Filter articles with score > 0 and sort by score
    return scoredArticles
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.article);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    // Simulate thinking delay
    setTimeout(() => {
      const matchedArticles = searchArticles(inputText);

      let botResponse: Message;
      if (matchedArticles.length > 0) {
        botResponse = {
          id: (Date.now() + 1).toString(),
          text: `I found ${matchedArticles.length} article${matchedArticles.length > 1 ? 's' : ''} that might help:`,
          sender: 'bot',
          articles: matchedArticles,
          timestamp: new Date()
        };
      } else {
        botResponse = {
          id: (Date.now() + 1).toString(),
          text: 'I couldn\'t find any articles matching your query. Try using different keywords or browse all articles.',
          sender: 'bot',
          timestamp: new Date()
        };
      }

      setMessages(prev => [...prev, botResponse]);
      setIsLoading(false);
    }, 500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickQuestions = [
    'How do I submit a query?',
    'What are the guidelines?',
    'How to track my query?',
    'Contact information'
  ];

  const handleQuickQuestion = (question: string) => {
    setInputText(question);
  };

  return (
    <div style={{ position: 'relative', zIndex: 9999 }}>
      {/* Floating Chat Icon */}
      {!isOpen && (
        <button
          onClick={() => {
            console.log('Chat icon clicked');
            setIsOpen(true);
          }}
          style={{ 
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '70px',
            height: '70px',
            zIndex: 9999,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
            padding: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Open CET Mitra"
        >
          {/* Chat bubble with graduation cap - Educational AI assistant */}
          <svg viewBox="0 0 64 64" fill="none" style={{ width: '70px', height: '70px', filter: 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.15))' }}>
            {/* Chat bubble - main body */}
            <path d="M 16 28 Q 16 18 24 18 L 40 18 Q 48 18 48 28 L 48 38 Q 48 46 40 46 L 28 46 L 20 52 L 20 46 Q 16 46 16 38 Z" 
                  fill="#0EA5E9" stroke="none"/>
            
            {/* Chat bubble - darker shade for depth */}
            <path d="M 16 32 Q 16 24 22 22 L 38 22 Q 46 24 46 32 L 46 40 Q 46 44 40 45 L 28 45 L 21 50 L 21 45 Q 16 44 16 40 Z" 
                  fill="#0284C7" stroke="none"/>
            
            {/* Three dots inside chat bubble */}
            <circle cx="26" cy="34" r="2.5" fill="white"/>
            <circle cx="32" cy="34" r="2.5" fill="white"/>
            <circle cx="38" cy="34" r="2.5" fill="white"/>
            
            {/* Graduation cap - base (mortarboard) */}
            <path d="M 16 20 L 32 14 L 48 20 L 32 26 Z" fill="#1E3A8A" stroke="none"/>
            
            {/* Graduation cap - top flat part */}
            <ellipse cx="32" cy="20" rx="16" ry="4" fill="#2563EB"/>
            
            {/* Graduation cap - side depth */}
            <path d="M 20 22 L 20 26 Q 32 30 44 26 L 44 22 Z" fill="#1E3A8A" opacity="0.8"/>
            
            {/* Tassel */}
            <line x1="46" y1="20" x2="50" y2="26" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="50" cy="26" r="2" fill="#F59E0B"/>
            <line x1="50" y1="28" x2="50" y2="32" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
            <ellipse cx="50" cy="33" rx="2.5" ry="3" fill="#F59E0B"/>
          </svg>
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            width: '16px',
            height: '16px',
            backgroundColor: '#22c55e',
            border: '2px solid white',
            borderRadius: '50%',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}></span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '384px',
          height: '600px',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          border: '1px solid #e5e7eb'
        }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold">CET Mitra</div>
                <div className="text-xs text-blue-100">Always here to help</div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message) => (
              <div key={message.id}>
                <div className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${message.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800'} rounded-2xl px-4 py-2 shadow-sm`}>
                    <p className="text-sm">{message.text}</p>
                  </div>
                </div>
                
                {/* Display matched articles */}
                {message.articles && message.articles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.articles.map((article) => (
                      <div key={article._id} className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                        <div className="font-semibold text-sm text-gray-900 mb-1">{article.title}</div>
                        <div 
                          className="text-xs text-gray-600 line-clamp-2"
                          dangerouslySetInnerHTML={{ 
                            __html: DOMPurify.sanitize(article.content.substring(0, 150) + '...') 
                          }}
                        />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">👁️ {article.viewCount} views</span>
                          <button 
                            onClick={() => {
                              const fullContent = DOMPurify.sanitize(article.content);
                              const expandedMessage: Message = {
                                id: Date.now().toString(),
                                text: article.title,
                                sender: 'bot',
                                timestamp: new Date()
                              };
                              setMessages(prev => [...prev, expandedMessage, {
                                id: (Date.now() + 1).toString(),
                                text: fullContent,
                                sender: 'bot',
                                timestamp: new Date()
                              }]);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Read more →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl px-4 py-2 shadow-sm">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Quick Questions */}
            {messages.length === 1 && !isLoading && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 text-center mb-2">Quick questions:</p>
                {quickQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickQuestion(question)}
                    className="w-full text-left bg-white hover:bg-blue-50 text-sm text-gray-700 rounded-lg px-3 py-2 border border-gray-200 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-gray-200 rounded-b-2xl">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your question..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isLoading}
                className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KBChatbot;
