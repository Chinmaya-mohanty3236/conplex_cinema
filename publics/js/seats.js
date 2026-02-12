document.addEventListener("DOMContentLoaded", () => {

    const seats = document.querySelectorAll(".seat.available");
    const selectedSeatsEl = document.getElementById("selectedSeats");
    const totalPriceEl = document.getElementById("totalPrice");
    const seatIdsInput = document.getElementById("seatIds");

    let selectedSeats = [];
    let total = 0;

    seats.forEach(seat => {
        seat.addEventListener("click", () => {

            const seatId = seat.dataset.id;
            const price = parseInt(seat.dataset.price);

            if (seat.classList.contains("selected")) {
                seat.classList.remove("selected");
                selectedSeats = selectedSeats.filter(id => id !== seatId);
                total -= price;
            } else {
                seat.classList.add("selected");
                selectedSeats.push(seatId);
                total += price;
            }

            selectedSeatsEl.innerText = selectedSeats.join(", ") || "None";
            totalPriceEl.innerText = total;
            seatIdsInput.value = selectedSeats.join(",");
        });
    });

});
