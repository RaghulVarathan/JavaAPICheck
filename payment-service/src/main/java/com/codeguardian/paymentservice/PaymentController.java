package com.codeguardian.paymentservice;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
public class PaymentController {

    private final PaymentProcessingService paymentProcessingService;
    private final MerchantRepository merchantRepository;
    private final StructuredLogWriter logWriter;

    public PaymentController(PaymentProcessingService paymentProcessingService,
                             MerchantRepository merchantRepository,
                             StructuredLogWriter logWriter) {
        this.paymentProcessingService = paymentProcessingService;
        this.merchantRepository = merchantRepository;
        this.logWriter = logWriter;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP", "service", "payment-service");
    }

    @GetMapping("/merchants")
    public List<Merchant> getMerchants() {
        return merchantRepository.findAll();
    }

    @PostMapping("/payments/charge")
    public ResponseEntity<CheckoutResponse> charge(@RequestBody CheckoutRequest request,
                                                    @RequestHeader(value = "X-Request-ID", required = false) String requestId) {
        String effectiveRequestId = (requestId != null && !requestId.isBlank()) ? requestId : "req-internal-gen";

        logWriter.log("payment-service", "payment_processing", effectiveRequestId, Map.of(
                "order_id", request.orderId() != null ? request.orderId() : 0L,
                "merchant_code", request.merchantCode(),
                "status_code", 200,
                "message", "Attempting to resolve demo payment record"
        ));

        CheckoutResponse response = paymentProcessingService.charge(request);

        logWriter.log("payment-service", "payment_completed", effectiveRequestId, Map.of(
                "status_code", 200,
                "message", "Payment processed"
        ));
        return ResponseEntity.ok(response);
    }

    @ExceptionHandler(NullPointerException.class)
    public ResponseEntity<ErrorResponse> handleNullPointer(NullPointerException exception,
                                                           HttpServletRequest request) {
        String requestId = request.getHeader("X-Request-ID");
        String effectiveRequestId = (requestId != null && !requestId.isBlank()) ? requestId : "req-missing";

        int lineNumber = 24;
        for (StackTraceElement element : exception.getStackTrace()) {
            if ("PaymentService.java".equals(element.getFileName())) {
                lineNumber = element.getLineNumber();
                break;
            }
        }

        logWriter.log("payment-service", "error", effectiveRequestId, Map.of(
                "status_code", HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "error_code", "NULL_OBJECT_ACCESS",
                "message", "Payment processing failed because merchant data was unavailable",
                "source_file", "PaymentService.java",
                "source_line", lineNumber
        ));

        ErrorResponse errorResponse = ErrorResponse.of(
                effectiveRequestId,
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "NULL_OBJECT_ACCESS",
                "Payment processing failed because merchant data was unavailable",
                "payment-service",
                "/payments/charge",
                "NullPointerException",
                "PaymentService.java",
                lineNumber
        );

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .header("X-Request-ID", effectiveRequestId)
                .body(errorResponse);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException exception,
                                                               HttpServletRequest request) {
        String requestId = request.getHeader("X-Request-ID");
        String effectiveRequestId = (requestId != null && !requestId.isBlank()) ? requestId : "req-missing";

        logWriter.log("payment-service", "merchant_not_found", effectiveRequestId, Map.of(
                "status_code", HttpStatus.NOT_FOUND.value(),
                "error_code", "MERCHANT_NOT_FOUND",
                "message", exception.getMessage(),
                "source_file", "PaymentService.java",
                "source_line", 21
        ));

        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .header("X-Request-ID", effectiveRequestId)
                .body(ErrorResponse.of(
                        effectiveRequestId,
                        HttpStatus.NOT_FOUND.value(),
                        "MERCHANT_NOT_FOUND",
                        exception.getMessage(),
                        "payment-service",
                        "/payments/charge",
                        "IllegalArgumentException",
                        "PaymentService.java",
                        21
                ));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ErrorResponse> handleIllegalState(IllegalStateException exception,
                                                            HttpServletRequest request) {
        String requestId = request.getHeader("X-Request-ID");
        String effectiveRequestId = (requestId != null && !requestId.isBlank()) ? requestId : "req-missing";

        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .header("X-Request-ID", effectiveRequestId)
                .body(ErrorResponse.of(
                        effectiveRequestId,
                        HttpStatus.BAD_REQUEST.value(),
                        "INACTIVE_MERCHANT",
                        exception.getMessage(),
                        "payment-service",
                        "/payments/charge",
                        "IllegalStateException",
                        "PaymentService.java",
                        26
                ));
    }
}
