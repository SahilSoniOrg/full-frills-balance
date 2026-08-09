import {
  AiExampleStyles,
  AiExampleTokens,
  ChatMsg,
  MODELS,
  ModelKey,
} from '@/src/features/journal/components/aiExampleShared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { MultimodalPart } from 'react-native-litert-lm';

type ModelLike = {
  execute: (parts: MultimodalPart[], onToken?: (token: string) => void) => Promise<string>;
};

export function AiExampleChatPanel({
  model,
  isReady,
  selectedModel,
  T,
  s,
}: {
  model: ModelLike | null;
  isReady: boolean;
  selectedModel: ModelKey;
  T: AiExampleTokens;
  s: AiExampleStyles;
}) {
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chat, streaming]);

  const send = useCallback(async () => {
    if (!model || busy) return;
    const msg = input.trim();
    if (!msg) return;

    setInput('');
    setBusy(true);
    setChat(prev => [...prev, { role: 'user', text: msg }]);
    setStreaming('');

    try {
      const parts: MultimodalPart[] = [{ type: 'text', text: msg }];
      let full = '';
      const reply = await model.execute(parts, (token: string) => {
        full += token;
        setStreaming(full);
      });

      setChat(prev => [...prev, { role: 'model', text: reply }]);
      setStreaming('');
    } catch (e: any) {
      setChat(prev => [...prev, { role: 'model', text: `Error: ${e.message}` }]);
      setStreaming('');
    } finally {
      setBusy(false);
    }
  }, [model, input, busy]);

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={s.chatArea}
        contentContainerStyle={s.chatContent}
        keyboardShouldPersistTaps="handled"
      >
        {isReady && chat.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyTitle}>Ready to chat</Text>
            <Text style={s.emptySub}>
              {MODELS[selectedModel].label} loaded. Send a message to begin.
            </Text>
            <View style={s.suggestRow}>
              {['Tell me a joke', 'What is React Native?', 'Explain gravity'].map(q => (
                <TouchableOpacity key={q} style={s.suggestChip} onPress={() => setInput(q)}>
                  <Text style={s.suggestText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {chat.map((m, i) => (
          <View key={i} style={[s.bubbleRow, m.role === 'user' && { justifyContent: 'flex-end' }]}>
            <View
              style={[
                s.bubble,
                m.role === 'user' ? { backgroundColor: T.accent } : { backgroundColor: T.card },
              ]}
            >
              <Text style={[s.bubbleText, m.role === 'user' && { color: T.onPrimary }]}>
                {m.text}
              </Text>
            </View>
          </View>
        ))}

        {streaming !== '' && (
          <View style={s.bubbleRow}>
            <View style={[s.bubble, { backgroundColor: T.card }]}>
              <Text style={s.bubbleText}>
                {streaming}
                <Text style={{ color: T.accent }}>▊</Text>
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {isReady && (
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            placeholder="Message…"
            placeholderTextColor={T.dim}
            value={input}
            onChangeText={setInput}
            editable={!busy}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}
            onPress={send}
            disabled={!input.trim() || busy}
          >
            {busy ? (
              <ActivityIndicator color={T.onPrimary} size="small" />
            ) : (
              <Text style={s.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}
