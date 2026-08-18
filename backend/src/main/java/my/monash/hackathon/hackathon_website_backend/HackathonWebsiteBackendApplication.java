package my.monash.hackathon.hackathon_website_backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class HackathonWebsiteBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(HackathonWebsiteBackendApplication.class, args);
	}

}
