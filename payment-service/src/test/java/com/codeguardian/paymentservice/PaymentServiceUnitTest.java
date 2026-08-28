package com.codeguardian.paymentservice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class PaymentServiceUnitTest {

    private MerchantRepository merchantRepository;
    private PaymentRepository paymentRepository;
    private PaymentService paymentService;

    @BeforeEach
    void setUp() {
        merchantRepository = Mockito.mock(MerchantRepository.class);
        paymentRepository = Mockito.mock(PaymentRepository.class);
        paymentService = new PaymentService(merchantRepository, paymentRepository);
    }

    @Test
    void missingMerchantThrowsIllegalArgumentException() {
        when(merchantRepository.findByMerchantCode("MCH-UNKNOWN")).thenReturn(null);

        CheckoutRequest request = new CheckoutRequest(101L, 5001L, 499.0, "MCH-UNKNOWN");

        // After the repair patch, null merchant is safely caught and throws IllegalArgumentException
        assertThatThrownBy(() -> paymentService.processPayment(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Merchant not found");
    }

    @Test
    void activeMerchantSuccessfullyProcessesPayment() {
        Merchant merchant = new Merchant("MCH-5002", "CodeGuardian Verified", true, "key_test");
        when(merchantRepository.findByMerchantCode("MCH-5002")).thenReturn(merchant);

        Payment savedPayment = new Payment(5002L, "MCH-5002", 149.0, "SUCCESS", "TX-12345678");
        when(paymentRepository.save(any(Payment.class))).thenReturn(savedPayment);

        CheckoutRequest request = new CheckoutRequest(101L, 5002L, 149.0, "MCH-5002");
        Payment result = paymentService.processPayment(request);

        assertThat(result).isNotNull();
        assertThat(result.getStatus()).isEqualTo("SUCCESS");
        assertThat(result.getMerchantCode()).isEqualTo("MCH-5002");
    }
}
