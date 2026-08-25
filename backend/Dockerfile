# Stage 1: Build JAR using Maven
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app

# Copy pom.xml and resolve dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source code and build production package
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Production JRE runtime image
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Create a non-privileged application user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser:appgroup

# Copy compiled jar from builder stage
COPY --from=builder --chown=appuser:appgroup /app/target/*.jar app.jar

# Cloud Run default port is 8080
ENV PORT=8080
EXPOSE 8080

# Production JVM options optimized for container memory constraints
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
