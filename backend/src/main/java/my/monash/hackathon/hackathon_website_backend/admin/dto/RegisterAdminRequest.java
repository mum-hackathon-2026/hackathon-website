package my.monash.hackathon.hackathon_website_backend.admin.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterAdminRequest(
        @NotBlank(message = "Email is required.")
        @Email(message = "Invalid email format.")
        @Size(max = 320, message = "Email must not exceed 320 characters.")
        String email,

        @NotBlank(message = "Full name is required.")
        @Size(max = 200, message = "Full name must not exceed 200 characters.")
        String fullName
) {}
