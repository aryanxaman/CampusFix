package edu.vit.campusfix;

import jakarta.servlet.*;
import jakarta.servlet.annotation.WebListener;
import java.util.concurrent.*;

@WebListener
public final class AppLifecycle implements ServletContextListener {

    private ScheduledExecutorService scheduler;

    @Override
    public void contextInitialized(ServletContextEvent event) {
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "campusfix-sla-monitor");
            t.setDaemon(true);
            return t;
        });
        int interval = 60;
        try {
            interval = Math.max(
                5,
                Math.min(3600, Integer.parseInt(Database.env("CAMPUSFIX_SLA_SCAN_SECONDS", "60")))
            );
        } catch (NumberFormatException ignored) {}
        scheduler.scheduleWithFixedDelay(
            () -> {
                try {
                    new SlaService().escalate();
                } catch (Exception e) {
                    event
                        .getServletContext()
                        .log(
                            "SLA monitor unavailable; check database connection and migrations",
                            e
                        );
                }
            },
            Math.min(10, interval),
            interval,
            TimeUnit.SECONDS
        );
    }

    @Override
    public void contextDestroyed(ServletContextEvent event) {
        if (scheduler != null) {
            scheduler.shutdownNow();
            try {
                scheduler.awaitTermination(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        // Cleanly release the driver/cleanup thread owned by this WAR during Tomcat redeployment.
        com.mysql.cj.jdbc.AbandonedConnectionCleanupThread.checkedShutdown();
        ClassLoader owner = AppLifecycle.class.getClassLoader();
        java.util.Enumeration<java.sql.Driver> drivers = java.sql.DriverManager.getDrivers();
        while (drivers.hasMoreElements()) {
            java.sql.Driver driver = drivers.nextElement();
            if (driver.getClass().getClassLoader() == owner) try {
                java.sql.DriverManager.deregisterDriver(driver);
            } catch (java.sql.SQLException e) {
                event.getServletContext().log("Unable to release JDBC driver", e);
            }
        }
    }
}
