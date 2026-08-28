package com.codeguardian.paymentservice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
class PaymentServiceApplicationTests {

    @Autowired
    private PaymentProcessingService paymentProcessingService;

    @Autowired
    private MerchantRepository merchantRepository;

    @Autowired
    private StructuredLogWriter logWriter;

    private MockMvc mockMvc;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders
                .standaloneSetup(new PaymentController(paymentProcessingService, merchantRepository, logWriter))
                .build();
    }

    @Test
    void healthEndpointReturnsUp() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("payment-service"));
    }

    @Test
    void missingMerchantReturnsControlledNotFound() throws Exception {
        mockMvc.perform(post("/payments/charge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Request-ID", "req-test-bug-5001")
                        .content("""
                                {"userId":101,"orderId":5001,"amount":499.0,"merchantCode":"MCH-UNKNOWN"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("MERCHANT_NOT_FOUND"))
                .andExpect(jsonPath("$.service").value("payment-service"))
                .andExpect(jsonPath("$.source.file").value("PaymentService.java"));
    }

    @Test
    void knownPaymentRecordCompletesSuccessfully() throws Exception {
        mockMvc.perform(post("/payments/charge")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Request-ID", "req-test-success-5002")
                        .content("""
                                {"userId":101,"orderId":5002,"amount":149.0,"merchantCode":"MCH-5002"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"));
    }
}
