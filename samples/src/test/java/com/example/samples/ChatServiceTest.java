package com.example.samples;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

class ChatServiceTest {

    @Test
    void chatServiceUsesStubModel() {
        ChatService service = new ChatService(ChatClient.builder(new StubChatModel("stub answer")));
        assertEquals("stub answer", service.ask("hello"));
    }

    @Test
    void weatherToolIsPlainJava() {
        assertEquals("Beijing: 18C, sunny", new WeatherTools().weather("Beijing"));
    }
}
