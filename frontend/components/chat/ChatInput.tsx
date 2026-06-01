'use client'

import { useRef, useCallback } from 'react'
import { Paperclip, Send, Square } from 'lucide-react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  isStreaming: boolean
  hasAskUser: boolean
  isDisabled: boolean
  uploadedFile: { path: string; name: string } | null
  isUploading: boolean
  onSend: () => void
  onStop: () => void
  onFileSelect: (file: File) => void
  onFileClear: () => void
}

export default function ChatInput({
  value,
  onChange,
  isStreaming,
  hasAskUser,
  isDisabled,
  uploadedFile,
  isUploading,
  onSend,
  onStop,
  onFileSelect,
  onFileClear,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isDisabled && !hasAskUser && value.trim()) onSend()
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
    e.target.value = ''
  }

  const inputDisabled = isStreaming || hasAskUser || isDisabled

  return (
    <div className="shrink-0 border-t border-stone-200 bg-white">
      <div className="max-w-3xl mx-auto px-4 py-3">
        {/* Attachment chip */}
        {uploadedFile && (
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-stone-700 bg-stone-100 border border-stone-200 rounded-lg px-2.5 py-1">
              <Paperclip className="w-3.5 h-3.5 text-stone-400" />
              {uploadedFile.name}
              <button
                onClick={onFileClear}
                className="text-stone-400 hover:text-stone-600 ml-0.5 transition-colors"
              >
                ✕
              </button>
            </span>
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* File upload button */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || isUploading}
            title="上傳附件"
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-stone-200 text-stone-400 hover:text-stone-600 hover:border-stone-300 hover:bg-stone-50 disabled:opacity-40 transition-colors shrink-0"
          >
            {isUploading ? (
              <div className="border-2 border-stone-300 border-t-indigo-500 rounded-full animate-spin w-4 h-4" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              autoResize(e.target)
            }}
            onKeyDown={handleKeyDown}
            placeholder="輸入訊息… (Shift+Enter 換行)"
            rows={1}
            disabled={inputDisabled}
            className="flex-1 min-h-9 max-h-40 bg-white border border-stone-200 text-stone-900 placeholder:text-stone-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50 resize-none overflow-y-auto leading-5"
          />

          {/* Send / Stop */}
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="h-9 w-9 flex items-center justify-center bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-600 rounded-lg transition-colors shrink-0"
              title="停止"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!value.trim() || hasAskUser || isDisabled}
              className="h-9 w-9 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0"
              title="送出"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-[10px] text-stone-400 mt-1.5 text-center">
          AI 可能會出錯，重要事項請自行確認
        </p>
      </div>
    </div>
  )
}
