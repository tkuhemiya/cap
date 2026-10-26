cmake_minimum_required(VERSION 3.16)
project(cap LANGUAGES CXX)

if(NOT DEEPSEEK_API_KEY)
  message(FATAL_ERROR "Pass -DDEEPSEEK_API_KEY=sk-xxx")
endif()

add_subdirectory(baml_sdk)

add_executable(cap cap.cpp)
target_link_libraries(cap PRIVATE baml::sdk)
target_compile_definitions(cap PRIVATE API_KEY="${DEEPSEEK_API_KEY}")
