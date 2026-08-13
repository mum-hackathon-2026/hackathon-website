package my.monash.hackathon.hackathon_website_backend.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

/**
 * A person with an account, mapped to the {@code users} table created by V1.
 *
 * <p>{@code role} is deliberately String, not a Java enum. The CHECK vocabularies in V1
 * are unratified proposals, and an enum would both freeze them prematurely and risk
 * failing {@code ddl-auto=validate} against a text column.
 *
 * <p>There is no {@code status} field: V2 dropped {@code users.status} because deletion is
 * a hard delete. A user who is deleted is gone from the table, rather than being a row
 * every query has to remember to filter out.
 *
 * <p>V3 made {@code google_sub} nullable and added {@code phone}, {@code resume_url} and
 * {@code linkedin_url}. Registration happens through a Google Form, so a participant's row
 * exists — and is what permits them to sign in — before they have ever authenticated with
 * Google. A null {@code googleSub} means exactly that: registered, never signed in.
 */
@Entity
@Table(name = "users")
public class User {

    /**
     * The column is BIGINT GENERATED ALWAYS AS IDENTITY, which rejects any value supplied
     * by the caller, so the id is never assigned from Java.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Nullable since V3: only a real OAuth sign-in yields a subject claim, and a
     * form-registered participant has not signed in yet. Still UNIQUE — Postgres does not
     * collide NULLs in a unique index, so any number of pending users may hold null here.
     */
    @Column(name = "google_sub")
    private String googleSub;

    /** V1 enforces {@code email = lower(email)}, so callers must store it lowercased. */
    @Column(nullable = false)
    private String email;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    // The two initialisers below duplicate the DEFAULTs in V1 (role 'participant',
    // email_verified false). The duplication is necessary, not accidental: these columns
    // are NOT NULL and Hibernate always names them in the INSERT, so the database DEFAULT
    // never gets the chance to apply and a null field would fail the insert instead of
    // falling back.
    //
    // KEEP IN SYNC: if a later migration changes one of these DEFAULTs, change it here
    // too. Nothing enforces the correspondence — no test can catch a mismatch, because
    // both sides would still be individually valid.

    @Column(nullable = false)
    private String role = "participant";

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified = false;

    @Column(name = "last_login_at")
    private OffsetDateTime lastLoginAt;

    // The three fields below are collected per participant by the registration form and
    // written by the CSV importer. All three are nullable in V3 on purpose: judges and
    // admins are rows in this table too, are created by hand rather than by the form, and
    // have no resume or LinkedIn profile to record. The form and the importer enforce the
    // requirement for participants; the database deliberately does not. See V3 for the
    // full reasoning before making any of them non-null.

    @Column(name = "phone")
    private String phone;

    /** Google Drive link to the participant's resume. Validated by the importer, not the DB. */
    @Column(name = "resume_url")
    private String resumeUrl;

    @Column(name = "linkedin_url")
    private String linkedinUrl;

    /**
     * Owned by the database, which fills it from DEFAULT now(). It is left out of both
     * INSERT and UPDATE, and {@code @Generated} makes Hibernate read the value back after
     * the insert rather than leaving the in-memory entity stale.
     */
    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    /** Required by JPA. */
    protected User() {}

    public User(String googleSub, String email, String fullName) {
        this.googleSub = googleSub;
        this.email = email;
        this.fullName = fullName;
    }

    public Long getId() {
        return id;
    }

    public String getGoogleSub() {
        return googleSub;
    }

    public void setGoogleSub(String googleSub) {
        this.googleSub = googleSub;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public boolean isEmailVerified() {
        return emailVerified;
    }

    public void setEmailVerified(boolean emailVerified) {
        this.emailVerified = emailVerified;
    }

    public OffsetDateTime getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(OffsetDateTime lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getResumeUrl() {
        return resumeUrl;
    }

    public void setResumeUrl(String resumeUrl) {
        this.resumeUrl = resumeUrl;
    }

    public String getLinkedinUrl() {
        return linkedinUrl;
    }

    public void setLinkedinUrl(String linkedinUrl) {
        this.linkedinUrl = linkedinUrl;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
