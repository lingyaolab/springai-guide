package com.example.samples;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

@Service
public class MovieService {

    private final ChatClient chatClient;

    public MovieService(ChatClient.Builder builder) {
        this.chatClient = builder.build();
    }

    public Movie extract(String text) {
        return chatClient.prompt()
                .user("从这段文字中提取电影信息：" + text)
                .call()
                .entity(Movie.class);
    }
}
