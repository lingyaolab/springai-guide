package com.example.samples;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SamplesApplication implements CommandLineRunner {

    private final ChatService chatService;
    private final MovieService movieService;

    public SamplesApplication(ChatService chatService, MovieService movieService) {
        this.chatService = chatService;
        this.movieService = movieService;
    }

    public static void main(String[] args) {
        SpringApplication.run(SamplesApplication.class, args);
    }

    @Override
    public void run(String... args) {
        System.out.println("=== chat ===");
        System.out.println(chatService.ask("用一句话解释 Spring AI 的 ChatClient。"));

        System.out.println("=== structured output ===");
        System.out.println(movieService.extract("《星际穿越》由诺兰执导，2014 年上映。"));
    }
}
