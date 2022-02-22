// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract Dex {


    //dev implement limit orders 

    enum Side {
        BUY,
        SELL
    }

    struct Token {
        bytes32 symbol;
        address tokenAddress;
    }
    
    struct Order {
        uint id;
        address trader;
        Side side;
        bytes32 symbol;
        uint amount;
        uint filled;
        uint price;
        uint date;
    }
    //dev track new tokens added
    mapping(bytes32 => Token) public tokens;

    //dev update the token list
    bytes32[] public tokenList;

    address public admin;

    //before trader can trade , they should sent eth to this smart contract
    //we will create two function 1 send eth 2 withdraw eth
    //we also keep track of how many tokens were sent by who

    mapping(address => mapping(bytes32 => uint)) public traderBalances;

    //dev implement a mapping for orderbook

    mapping(bytes32 => mapping(uint => Order[])) public orderBook;

    //dev track the current order id

    uint nextOrderId;
    uint nextTradeId;
    bytes32 constant DAI = bytes32('DAI');

    event newTrade(uint tradeId,
    uint  orderId,
    bytes32 indexed symbol,
    address indexed trader1, 
    address indexed trader2,
    uint amount, uint price,
    uint date);

    constructor() {
        admin = msg.sender;
    }

    function getOrders(
    bytes32 ticker, 
    Side side) 
    external 
    view
    returns(Order[] memory) {
    return orderBook[ticker][uint(side)];
    }
    function getTokens() 
      external 
      view 
      returns(Token[] memory) {
      Token[] memory _tokens = new Token[](tokenList.length);
      for (uint i = 0; i < tokenList.length; i++) {
        _tokens[i] = Token(
           tokens[tokenList[i]].symbol,
          tokens[tokenList[i]].tokenAddress
        );
      }
      return _tokens;
    }

    //dev create a function to add a token
    //and restrict it to only admin

    function addToken(
        bytes32 symbol,
        address tokenAddress
    ) external onlyAdmin() {
        tokens[symbol] = Token(symbol, tokenAddress);
        tokenList.push(symbol);
    }

    //dev create deposit function to deposit eth
    function deposit(uint amount, bytes32 symbol) external tokenExist(symbol) {
        //dev use openzeppelin contracts to implement an interface to allow deposits
        //dev use delegated transfer
          IERC20(tokens[symbol].tokenAddress).transferFrom(
              msg.sender, address(this), amount
          );

          //dev add amount to the trader balance
          traderBalances[msg.sender][symbol] =  traderBalances[msg.sender][symbol] +amount ;
    }
    //dev create a withdraw function
    //allows trader to withdraw his tokens

    function withdraw(uint amount, bytes32 symbol ) external tokenExist(symbol)  {
        //dev check that trader have more or equal amount of token
        //he is withdrawing
        require(traderBalances[msg.sender][symbol] >= amount, 'balance too low');
        //dev decrease trader balance
          traderBalances[msg.sender][symbol] = traderBalances[msg.sender][symbol] - amount;
        //dev transfer tokens to trader
        IERC20(tokens[symbol].tokenAddress).transfer(
            msg.sender, amount);

    } 

    function createLimitOrder(bytes32 symbol,
    uint amount, uint price, Side side
    ) external tokenExist(symbol) tokenIsNotDai(symbol) {
       //trader must have enough token in their balance
       if(side == Side.SELL) {
           require(traderBalances[msg.sender][symbol] >= amount, 'Balance too low');
       }else {
           require(traderBalances[msg.sender][DAI] >= amount*price, 'Dai Balance too low');
       }
       Order[] storage orders = orderBook[symbol][uint(side)];
       orders.push(Order( 
           nextOrderId,
           msg.sender,
           side,
           symbol,
           amount,
           0,
           price,
           block.timestamp
       ));

       //dev uses bubble sort algo to set the best price at the top of the orderbook

       uint i = orders.length > 0 ?  orders.length - 1 : 0;
       while(i > 0) {
           if(side == Side.BUY && orders[i - 1].price > orders[i].price) {
             break;
           }
           if(side == Side.SELL && orders[i - 1].price < orders[i].price) {
             break;
           }
           Order memory order = orders[i - 1];
           orders[i - 1] = orders[i];
           orders[i] = order;
           i--;
       }
       nextOrderId++;
    }
      
      //marketorder function to buy or sell tokens instantly

    function createMarketOrder(bytes32 symbol, uint amount, Side side) external tokenExist(symbol) tokenIsNotDai(symbol) {
             if(side == Side.SELL) {
           require(traderBalances[msg.sender][symbol] >= amount, 'Balance too low');
       }
       //dev point orders to the other side of orders in the orderbook
       Order[] storage orders = orderBook[symbol][uint(side == Side.BUY ? Side.SELL : Side.BUY)];
       uint i;
       uint remaining = amount;
       while(i < orders.length && remaining > 0){
           uint available = orders[i].amount - orders[i].filled;
           uint matched = (remaining > available) ? available : remaining;
           remaining = remaining - matched;
           orders[i].filled += matched;
           emit newTrade(
              orders[i].id,
              nextTradeId,
              symbol,
              orders[i].trader,
              msg.sender,
              matched,
              orders[i].price,
              block.timestamp

              
           );
           if(side == Side.SELL) {
                traderBalances[msg.sender][symbol] = traderBalances[msg.sender][symbol] - matched;
                traderBalances[msg.sender][DAI] = traderBalances[msg.sender][DAI] + (matched * orders[i].price);
                traderBalances[orders[i].trader][symbol] = traderBalances[orders[i].trader][symbol] + matched;
                traderBalances[orders[i].trader][DAI] = traderBalances[orders[i].trader][DAI] - (matched * orders[i].price);
           }
            if(side == Side.BUY) {
                traderBalances[msg.sender][symbol] = traderBalances[msg.sender][symbol] + matched;
                traderBalances[msg.sender][DAI] = traderBalances[msg.sender][DAI] - (matched * orders[i].price);
                traderBalances[orders[i].trader][symbol] = traderBalances[orders[i].trader][symbol] - matched;
                traderBalances[orders[i].trader][DAI] = traderBalances[orders[i].trader][DAI] + (matched * orders[i].price);
           }
           nextTradeId++;
           i++;
       }
       //dev remove orders that were completely filled from the orderbook
       i = 0;
       while(i < orders.length && orders[i].filled == orders[i].amount){
           for(uint j= 1; j< orders.length -1; j++){
               orders[j] = orders[j+1];
           }
           orders.pop();
           i++;
       }

    }

    modifier tokenIsNotDai(bytes32 symbol) {
        require(symbol != DAI, 'cannot trade Dai');
        _;
    }
    //dev create modifier so only admin can add tokens

    modifier onlyAdmin() {
        require(msg.sender == admin, 'only admin allowed');
        _;
    }

    //dev prevent anyone from adding/withdrawing token that
    //does not exit

    modifier tokenExist(bytes32 symbol) {
         require(tokens[symbol].tokenAddress != address(0), 'token does not exist');
         _;
    }
}