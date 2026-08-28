package com.codeguardian.paymentservice;

import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
public class PaymentService {

    private final MerchantRepository merchantRepository;
    private final PaymentRepository paymentRepository;

    public PaymentService(MerchantRepository merchantRepository, PaymentRepository paymentRepository) {
        this.merchantRepository = merchantRepository;
        this.paymentRepository = paymentRepository;
    }

    public Payment processPayment(CheckoutRequest request) {
        // Find merchant by code
        Merchant merchant = merchantRepository.findByMerchantCode(request.merchantCode());

        if (merchant == null) {
            throw new IllegalArgumentException("Merchant not found for code: " + request.merchantCode());
        }
        // INTENTIONAL DEFECT: Assuming merchant is always found and non-null.
        // If findByMerchantCode returns null (e.g. for ORDER 5001 / unknown merchant),
        // dereferencing merchant.isActive() throws a NullPointerException.
        if (!merchant.isActive()) {
            throw new IllegalStateException("Merchant is not active");
        }

        // Process payment
        String txRef = "TX-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        Payment payment = new Payment(
                request.orderId(),
                request.merchantCode(),
                request.amount(),
                "SUCCESS",
                txRef
        );
        return paymentRepository.save(payment);
    }
}
