import React, { useEffect } from 'react';

/**
 * Context View Modal Component
 * Display the complete context information sent to AI
 */
const ContextModal = ({ context, onClose }) => {
  // 处理键盘事件和阻止canvas操作
  useEffect(() => {
    const handleKeyDown = (e) => {
      // ESC键关闭modal
      if (e.key === 'Escape') {
        onClose();
      }
      // 阻止其他键盘事件传播到canvas
      e.stopPropagation();
    };

    // 阻止滚轮事件传播到canvas
    const handleWheel = (e) => {
      e.stopPropagation();
    };

    // 阻止鼠标事件传播到canvas（但不阻止文本选择）
    const handleMouseDown = (e) => {
      e.stopPropagation();
    };

    const handleMouseMove = (e) => {
      e.stopPropagation();
    };

    const handleMouseUp = (e) => {
      e.stopPropagation();
    };

    // 添加事件监听器，使用capture阶段拦截
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('wheel', handleWheel, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseup', handleMouseUp, true);

    // 阻止body滚动
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      // 清理事件监听器
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('wheel', handleWheel, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseup', handleMouseUp, true);

      // 恢复body滚动
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  if (!context) {
    return null;
  }

  const { messages, metadata } = context;

  const getRoleName = (role) => {
    const roleNames = {
      system: 'System',
      user: 'User',
      assistant: 'Assistant'
    };
    return roleNames[role] || role;
  };

  const getRoleColor = (role) => {
    const colors = {
      system: { background: '#f3f4f6', color: '#374151' },
      user: { background: '#dbeafe', color: '#1d4ed8' },
      assistant: { background: '#d1fae5', color: '#065f46' }
    };
    return colors[role] || { background: '#f3f4f6', color: '#374151' };
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        userSelect: 'none' // 遮罩层不可选择
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          width: '90vw',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '1200px',
          maxHeight: '800px',
          userSelect: 'text', // 内容区域可选择文本
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '24px',
            borderBottom: '1px solid #e5e7eb'
          }}
        >
          <div>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#111827',
              margin: 0
            }}>
              Context Information
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              margin: '4px 0 0 0'
            }}>
              Complete context sent to AI
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '24px',
              padding: '4px',
              borderRadius: '4px',
              transition: 'color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.color = '#6b7280'}
            onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Metadata Information */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#f9fafb',
            borderBottom: '1px solid #e5e7eb'
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              fontSize: '14px'
            }}
          >
            <div>
              <span style={{ color: '#6b7280' }}>Intent ID: </span>
              <span style={{
                color: '#374151',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                {metadata?.intentId?.slice(0, 8)}...
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Session ID: </span>
              <span style={{
                color: '#374151',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}>
                {metadata?.sessionId?.slice(0, 8)}...
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Message Count: </span>
              <span style={{ color: '#374151', fontWeight: '600' }}>
                {messages?.length || 0}
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Context Size: </span>
              <span style={{ color: '#374151', fontWeight: '600' }}>
                {((metadata?.contextSize || 0) / 1024).toFixed(1)} KB
              </span>
            </div>
          </div>
        </div>

        {/* Message List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px'
          }}
        >
          {messages && messages.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.map((msg, index) => {
                const roleStyle = getRoleColor(msg.role);
                return (
                  <div
                    key={index}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Message Header */}
                    <div
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: roleStyle.background,
                        color: roleStyle.color
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '600' }}>
                          {getRoleName(msg.role)}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          opacity: 0.75
                        }}>
                          #{index + 1}
                        </span>
                      </div>
                      
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content).then(() => {
                            // Can add a small success prompt
                          }).catch(err => {
                            console.error('Copy failed:', err);
                          });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'inherit',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          opacity: 0.7,
                          transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '1'}
                        onMouseLeave={(e) => e.target.style.opacity = '0.7'}
                        title="Copy this message"
                      >
                        📋
                      </button>
                    </div>

                    {/* Message Content */}
                    <div style={{
                      padding: '16px',
                      backgroundColor: 'white'
                    }}>
                      <pre style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: '14px',
                        color: '#374151',
                        fontFamily: 'inherit',
                        lineHeight: '1.6',
                        margin: 0,
                        userSelect: 'text',
                        WebkitUserSelect: 'text',
                        MozUserSelect: 'text',
                        msUserSelect: 'text',
                        cursor: 'text'
                      }}>
                        {msg.content}
                      </pre>
                    </div>

                    {/* Character Count */}
                    <div style={{
                      padding: '8px 16px',
                      backgroundColor: '#f9fafb',
                      fontSize: '12px',
                      color: '#6b7280'
                    }}>
                      {msg.content?.length || 0} characters
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#9ca3af'
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <svg
                  style={{
                    width: '64px',
                    height: '64px',
                    margin: '0 auto 16px auto',
                    display: 'block'
                  }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <p style={{ margin: 0 }}>No messages yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <button
            onClick={() => {
              // Copy all message content
              const allContent = messages?.map((msg, index) => {
                const roleName = getRoleName(msg.role);
                return `=== ${roleName} #${index + 1} ===\n${msg.content}`;
              }).join('\n\n') || '';
              
              navigator.clipboard.writeText(allContent).then(() => {
                // Can add a temporary success prompt
                alert('Context content copied to clipboard!');
              }).catch(err => {
                console.error('Copy failed:', err);
                alert('Copy failed, please manually select text to copy');
              });
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              fontSize: '14px'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
          >
            📋 Copy All
          </button>
          
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#e5e7eb'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#f3f4f6'}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContextModal;
