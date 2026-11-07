package com.example.samples;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

public class WeatherTools {

    @Tool(description = "查询指定城市的天气，只读")
    public String weather(@ToolParam(description = "城市名，例如 Beijing") String city) {
        return city + ": 18C, sunny";
    }
}
