package my.monash.hackathon.hackathon_website_backend.admin.dto;

/** The body for a reject / needs-fix / reopen decision. {@code note} is optional either way. */
public record ReviewDecisionRequest(String note) {}
