package my.monash.hackathon.hackathon_website_backend.admin.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record BatchRegisterJudgesRequest(
        @NotEmpty(message = "Judges list cannot be empty")
        List<@Valid RegisterJudgeRequest> judges
) {}
