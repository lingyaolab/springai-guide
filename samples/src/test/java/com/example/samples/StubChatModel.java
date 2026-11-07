package com.example.samples;

import java.util.List;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;

public class StubChatModel implements ChatModel {

    private final String reply;

    public StubChatModel(String reply) {
        this.reply = reply;
    }

    @Override
    public ChatResponse call(Prompt prompt) {
        var generation = new Generation(new AssistantMessage(reply));
        return ChatResponse.builder()
                .generations(List.of(generation))
                .metadata(ChatResponseMetadata.builder()
                        .usage(new DefaultUsage(12, reply.length()))
                        .build())
                .build();
    }
}
